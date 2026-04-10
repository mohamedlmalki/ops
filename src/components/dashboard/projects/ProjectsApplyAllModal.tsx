// --- FILE: src/components/dashboard/projects/ProjectsApplyAllModal.tsx ---
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { CopyCheck, Clock, AlertTriangle, Activity, ListChecks, Edit, Hash } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

interface ProjectsApplyAllModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (data: any) => void;
}

export const ProjectsApplyAllModal: React.FC<ProjectsApplyAllModalProps> = ({ isOpen, onClose, onApply }) => {
  const [formData, setFormData] = useState({
    primaryValues: '', 
    delay: '',
    stopAfterFailures: '',
    displayName: '', 
    enableTracking: false,
    appendAccountNumber: false,
  });

  const handleApply = () => {
    const updates: any = {};
    
    // Maps exactly to the Smart Text Splitter in the main form
    if (formData.primaryValues.trim()) updates.primaryValues = formData.primaryValues;
    if (formData.delay !== '') updates.delay = Number(formData.delay);
    if (formData.stopAfterFailures !== '') updates.stopAfterFailures = Number(formData.stopAfterFailures);
    if (formData.displayName.trim()) updates.displayName = formData.displayName;
    
    updates.enableTracking = formData.enableTracking;
    updates.appendAccountNumber = formData.appendAccountNumber;

    onApply(updates);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl bg-card border-border shadow-large max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2 text-xl">
            <CopyCheck className="h-5 w-5 text-primary" />
            <span>Apply Projects Settings to All</span>
          </DialogTitle>
          <DialogDescription>
            Generic fields left blank will keep their existing data. Checkboxes will instantly overwrite existing settings on all accounts. Project IDs and Tasklists are <strong>never</strong> overwritten.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="flex items-center space-x-2">
                <ListChecks className="h-4 w-4" />
                <span>Smart Text Splitter (List)</span>
              </Label>
              <Textarea 
                value={formData.primaryValues} 
                onChange={(e) => setFormData({...formData, primaryValues: e.target.value})}
                placeholder="Task Name 1&#10;Task Name 2&#10;(Leave blank to keep existing)"
                className="min-h-[160px] font-mono text-sm bg-muted/30 border-border focus:bg-card"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center space-x-2">
                  <Clock className="h-4 w-4" />
                  <span>Delay (Sec)</span>
                </Label>
                <Input 
                  type="number"
                  value={formData.delay} 
                  onChange={(e) => setFormData({...formData, delay: e.target.value})}
                  placeholder="Keep..."
                  className="bg-muted/30 border-border focus:bg-card"
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center space-x-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <span>Auto-Pause</span>
                </Label>
                <Input 
                  type="number"
                  min="0"
                  value={formData.stopAfterFailures} 
                  onChange={(e) => setFormData({...formData, stopAfterFailures: e.target.value})}
                  placeholder="Keep..."
                  className="bg-muted/30 border-border focus:bg-card"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="flex items-center space-x-2">
                <Edit className="h-4 w-4" />
                <span>Active Project Name</span>
              </Label>
              <Input 
                value={formData.displayName} 
                onChange={(e) => setFormData({...formData, displayName: e.target.value})}
                placeholder="Leave blank to keep existing..."
                className="bg-muted/30 border-border focus:bg-card"
              />
              <p className="text-xs text-muted-foreground mt-1">Updates the active project name field across profiles.</p>
            </div>

            <div className="space-y-2 pt-2">
              <Label className="flex items-center space-x-2">
                <Activity className="h-4 w-4" />
                <span>Optional Actions</span>
              </Label>
              <div className="space-y-4 rounded-lg bg-muted/30 p-4 border border-border">
                
                <div className="flex items-start space-x-3">
                  <Checkbox 
                    id="projects-apply-append-number" 
                    checked={formData.appendAccountNumber} 
                    onCheckedChange={(val) => setFormData({...formData, appendAccountNumber: !!val})} 
                  />
                  <div className="grid gap-1.5 leading-none">
                    <Label htmlFor="projects-apply-append-number" className="font-medium hover:cursor-pointer flex items-center">
                      Append Account Number
                    </Label>
                    <p className="text-xs text-muted-foreground">Adds 1, 2, 3... sequentially to the tasks.</p>
                  </div>
                </div>

                <Separator className="my-2" />

                <div className="flex items-start space-x-3">
                  <Checkbox 
                    id="projects-apply-tracking" 
                    checked={formData.enableTracking} 
                    onCheckedChange={(val) => setFormData({...formData, enableTracking: !!val})} 
                  />
                  <div className="grid gap-1.5 leading-none">
                    <Label htmlFor="projects-apply-tracking" className="font-medium hover:cursor-pointer text-blue-500">Enable Cloudflare Tracking</Label>
                    <p className="text-xs text-muted-foreground">Appends invisible tracking to tasks across all accounts.</p>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="pt-4 border-t border-border">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleApply} className="bg-purple-600 hover:bg-purple-700 text-white font-bold">
            <CopyCheck className="h-4 w-4 mr-2" /> Apply to All Accounts
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};