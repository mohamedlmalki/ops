import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';

interface DeskApplyAllModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (data: any) => void;
}

export const DeskApplyAllModal: React.FC<DeskApplyAllModalProps> = ({ isOpen, onClose, onApply }) => {
  const [formData, setFormData] = useState({
    subject: '',
    description: '',
    delay: '',
    sendDirectReply: false,
    verifyEmail: false,
    enableTracking: false,
  });

  const handleApply = () => {
    const updates: any = {};
    // Only apply text fields if they have content to avoid erasing existing data
    if (formData.subject.trim()) updates.subject = formData.subject;
    if (formData.description.trim()) updates.description = formData.description;
    if (formData.delay !== '') updates.delay = Number(formData.delay);
    
    // Checkboxes are always applied as selected
    updates.sendDirectReply = formData.sendDirectReply;
    updates.verifyEmail = formData.verifyEmail;
    updates.enableTracking = formData.enableTracking;

    onApply(updates);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Apply to All Accounts</DialogTitle>
          <DialogDescription>
            Fill the fields you want to copy to EVERY account. Leave text fields blank to keep existing data.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Subject</Label>
            <Input 
              value={formData.subject} 
              onChange={(e) => setFormData({...formData, subject: e.target.value})}
              placeholder="Keep existing..."
            />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea 
              value={formData.description} 
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              placeholder="Keep existing..."
            />
          </div>
          <div className="space-y-2">
            <Label>Delay (seconds)</Label>
            <Input 
              type="number"
              value={formData.delay} 
              onChange={(e) => setFormData({...formData, delay: e.target.value})}
            />
          </div>
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="apply-direct-reply" 
                checked={formData.sendDirectReply} 
                onCheckedChange={(val) => setFormData({...formData, sendDirectReply: !!val})} 
              />
              <Label htmlFor="apply-direct-reply">Direct Reply</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="apply-verify-email" 
                checked={formData.verifyEmail} 
                onCheckedChange={(val) => setFormData({...formData, verifyEmail: !!val})} 
              />
              <Label htmlFor="apply-verify-email">Verify Email</Label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleApply} className="bg-blue-600 hover:bg-blue-700 text-white font-bold">Apply to All Accounts</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};