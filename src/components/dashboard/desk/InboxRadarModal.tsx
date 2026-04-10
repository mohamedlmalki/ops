// --- FILE: src/components/dashboard/desk/InboxRadarModal.tsx ---

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Radar, RefreshCw, CheckCircle2, AlertOctagon, XCircle, MailWarning, Inbox } from 'lucide-react';
import { Profile } from '@/App';
import { Socket } from 'socket.io-client';
import { useToast } from '@/hooks/use-toast';

interface InboxRadarModalProps {
  isOpen: boolean;
  onClose: () => void;
  profiles: Profile[];
  socket: Socket | null;
}

export const InboxRadarModal: React.FC<InboxRadarModalProps> = ({ isOpen, onClose, profiles, socket }) => {
  const { toast } = useToast();
  const [isScanning, setIsScanning] = useState(false);
  const [scanResults, setScanResults] = useState<any>({});
  const [expectedCounts, setExpectedCounts] = useState<Record<string, number>>({});

  // 🔥 THE FIX: Look inside the user's saved Bulk Ticket Lists to count the emails!
  useEffect(() => {
    if (!isOpen) return;
    
    const counts: Record<string, number> = {};
    const cacheKeys = ['zoho_cache_jobs_ticket', 'zoho_cache_jobs_email', 'zoho_cache_jobs_catalyst'];
    
    profiles.forEach(profile => {
      let count = 0;
      const testEmails = profile.imapSettings?.map(s => s.email?.toLowerCase().trim()).filter(Boolean) || [];
      
      if (testEmails.length > 0) {
        // Look through the saved jobs to see how many times they pasted this email!
        cacheKeys.forEach(key => {
          try {
            const storedJobs = JSON.parse(window.localStorage.getItem(key) || '{}');
            const profileJob = storedJobs[profile.profileName];
            
            if (profileJob?.formData?.emails) {
              const targetEmails = profileJob.formData.emails.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
              targetEmails.forEach((email: string) => {
                if (testEmails.includes(email.toLowerCase())) count++;
              });
            }
          } catch (e) {}
        });
      }
      counts[profile.profileName] = count;
    });
    
    setExpectedCounts(counts);
  }, [profiles, isOpen]);

  useEffect(() => {
    if (!socket) return;
    const handleRadarResult = (data: any) => {
      setIsScanning(false);
      setScanResults(data.results);
      toast({ title: "Radar Scan Complete", description: "Inbox matrix has been updated." });
    };
    socket.on('radarScanComplete', handleRadarResult);
    return () => { socket.off('radarScanComplete', handleRadarResult); };
  }, [socket, toast]);

  const handleStartScan = () => {
    if (!socket) return;
    setIsScanning(true);
    toast({ title: "Radar Initiated", description: "Hunting for emails. This may take up to 60 seconds..." });
    
    const activeProfiles = profiles.map(p => p.profileName);
    // Send the actual counts to the backend so the math is perfect
    socket.emit('triggerInboxRadar', { profiles: activeProfiles, expectations: expectedCounts });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl bg-card border-border shadow-large max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2 text-2xl">
            <Radar className="h-6 w-6 text-indigo-500" />
            <span>Inbox Radar Matrix</span>
          </DialogTitle>
          <DialogDescription>
            Live deliverability tracking. Scans your test accounts to see if your tickets landed in the Inbox or Spam folder.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4">
          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-4 py-3 font-semibold text-foreground">Zoho Account</th>
                  <th className="px-4 py-3 font-semibold text-foreground text-center" title="Emails found in your Bulk Ticket list">Test Inboxes</th>
                  <th className="px-4 py-3 font-semibold text-foreground text-center">Status</th>
                  <th className="px-4 py-3 font-semibold text-foreground text-center">Inbox Hit</th>
                  <th className="px-4 py-3 font-semibold text-foreground text-center">Spam Hit</th>
                  <th className="px-4 py-3 font-semibold text-foreground text-center">Missing / Blocked</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((profile, idx) => {
                  const result = scanResults[profile.profileName];
                  const hasResult = !!result;
                  const expectedCount = expectedCounts[profile.profileName] || 0;
                  
                  return (
                    <tr key={idx} className="border-b border-border/50 hover:bg-muted/20">
                      <td className="px-4 py-3 font-medium text-foreground">{profile.profileName}</td>
                      
                      <td className="px-4 py-3 text-center">
                         <div className="flex items-center justify-center space-x-1">
                            <Inbox className={`h-4 w-4 ${expectedCount > 0 ? 'text-indigo-500' : 'text-slate-300'}`} />
                            <span className={`font-bold ${expectedCount > 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`}>
                                {expectedCount}
                            </span>
                         </div>
                      </td>

                      <td className="px-4 py-3 text-center">
                        {isScanning ? (
                          <Badge variant="outline" className="text-blue-500 border-blue-200 bg-blue-50 dark:bg-blue-900/20">
                            <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> Scanning
                          </Badge>
                        ) : hasResult ? (
                          <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">Checked</Badge>
                        ) : expectedCount === 0 ? (
                          <Badge variant="outline" className="text-amber-500 border-amber-200 bg-amber-50">Not in Ticket List</Badge>
                        ) : (
                          <Badge variant="outline" className="text-slate-400">Waiting...</Badge>
                        )}
                      </td>

                      <td className="px-4 py-3 text-center">
                        {hasResult ? (
                          <span className="flex items-center justify-center font-bold text-green-600">
                            {result.inbox} <CheckCircle2 className="h-4 w-4 ml-1" />
                          </span>
                        ) : "-"}
                      </td>

                      <td className="px-4 py-3 text-center">
                        {hasResult ? (
                          <span className="flex items-center justify-center font-bold text-amber-500">
                            {result.spam} <AlertOctagon className="h-4 w-4 ml-1" />
                          </span>
                        ) : "-"}
                      </td>

                      <td className="px-4 py-3 text-center">
                        {hasResult ? (
                          <span className="flex items-center justify-center font-bold text-red-500">
                            {result.missing} <XCircle className="h-4 w-4 ml-1" />
                          </span>
                        ) : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between pt-4 border-t border-border">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={handleStartScan} disabled={isScanning} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold">
            {isScanning ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Radar className="h-4 w-4 mr-2" />}
            {isScanning ? "Scanning Inboxes..." : "Scan Test Inboxes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};