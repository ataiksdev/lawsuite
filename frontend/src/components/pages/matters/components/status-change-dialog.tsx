'use client';

import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { MatterStatus } from '@/lib/types';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

// ============================================================================
// Status State Machine
// ============================================================================

const STATUS_TRANSITIONS: Record<string, string[]> = {
  [MatterStatus.INTAKE]: [MatterStatus.OPEN],
  [MatterStatus.OPEN]: [MatterStatus.PENDING, MatterStatus.IN_REVIEW, MatterStatus.CLOSED, MatterStatus.ARCHIVED],
  [MatterStatus.PENDING]: [MatterStatus.OPEN, MatterStatus.IN_REVIEW, MatterStatus.CLOSED, MatterStatus.ARCHIVED],
  [MatterStatus.IN_REVIEW]: [MatterStatus.OPEN, MatterStatus.CLOSED, MatterStatus.ARCHIVED],
  [MatterStatus.CLOSED]: [MatterStatus.ARCHIVED],
  [MatterStatus.ARCHIVED]: [],
};

const STATUS_LABELS: Record<string, string> = {
  [MatterStatus.INTAKE]: 'Intake',
  [MatterStatus.OPEN]: 'Open',
  [MatterStatus.PENDING]: 'Pending',
  [MatterStatus.IN_REVIEW]: 'In Review',
  [MatterStatus.CLOSED]: 'Closed',
  [MatterStatus.ARCHIVED]: 'Archived',
};

function getStatusBadgeClass(status: string): string {
  const map: Record<string, string> = {
    intake: 'badge-intake',
    open: 'badge-open',
    pending: 'badge-pending',
    in_review: 'badge-in_review',
    closed: 'badge-closed',
    archived: 'badge-archived',
  };
  return map[status] || '';
}

// ============================================================================
// Component
// ============================================================================

interface StatusChangeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentStatus: MatterStatus;
  onSave: (newStatus: MatterStatus, reason: string) => void;
}

export function StatusChangeDialog({
  open,
  onOpenChange,
  currentStatus,
  onSave,
}: StatusChangeDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [newStatus, setNewStatus] = useState<string>('');
  const [reason, setReason] = useState('');

  const validTransitions = STATUS_TRANSITIONS[currentStatus] || [];

  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setNewStatus('');
      setReason('');
    }
    onOpenChange(newOpen);
  };

  const handleConfirm = async () => {
    if (!newStatus) return;

    setIsLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 500));

    onSave(newStatus as MatterStatus, reason.trim());
    setIsLoading(false);
    toast.success(`Status changed to "${STATUS_LABELS[newStatus]}"`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>Change Matter Status</DialogTitle>
          <DialogDescription>
            Transition this matter from its current status to a new one.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Current Status */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50">
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
              Current Status
            </span>
            <Badge
              variant="outline"
              className={cn('border', getStatusBadgeClass(currentStatus))}
            >
              {STATUS_LABELS[currentStatus]}
            </Badge>
          </div>

          {/* Arrow */}
          <div className="flex justify-center">
            <div className="h-8 w-8 rounded-full bg-emerald-100 dark:bg-emerald-950/30 flex items-center justify-center">
              <span className="text-emerald-600 dark:text-emerald-400 text-lg">→</span>
            </div>
          </div>

          {/* New Status */}
          <div className="space-y-2">
            <Label>New Status</Label>
            <Select value={newStatus} onValueChange={setNewStatus}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Select new status..." />
              </SelectTrigger>
              <SelectContent>
                {validTransitions.map((status) => (
                  <SelectItem key={status} value={status}>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={cn(
                          'border text-[10px] px-1.5 py-0',
                          getStatusBadgeClass(status)
                        )}
                      >
                        {STATUS_LABELS[status]}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {validTransitions.length === 0 && (
              <p className="text-sm text-slate-500 dark:text-slate-400 italic">
                No status transitions available from &ldquo;{STATUS_LABELS[currentStatus]}&rdquo;
              </p>
            )}
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <Label htmlFor="status-reason">Reason / Notes</Label>
            <Textarea
              id="status-reason"
              placeholder="Optional: Add a note explaining this status change..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="min-h-[80px] resize-y"
            />
          </div>
        </div>

        {/* Actions */}
        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={isLoading || !newStatus}
            onClick={handleConfirm}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Updating...
              </>
            ) : (
              'Confirm Status Change'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
