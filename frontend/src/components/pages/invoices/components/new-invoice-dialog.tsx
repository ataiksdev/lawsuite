'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { handleApiError } from '@/lib/error-utils';
import { createInvoice, type BackendInvoice } from '@/lib/api/invoices';
import type { BackendClient } from '@/lib/api/clients';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface NewInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: BackendClient[];
  onCreated: (invoice: BackendInvoice) => void;
}

export function NewInvoiceDialog({ open, onOpenChange, clients, onCreated }: NewInvoiceDialogProps) {
  const [clientId, setClientId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [isBillOfCharges, setIsBillOfCharges] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Guards against a second submission landing before React re-renders the
  // disabled button (fast double-click, or requestSubmit() bypassing it).
  const submittingRef = useRef(false);

  useEffect(() => {
    if (open) {
      setClientId('');
      setDueDate('');
      setIsBillOfCharges(false);
      setError(null);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    if (!clientId) {
      setError('Select a client to bill.');
      return;
    }
    submittingRef.current = true;
    setIsLoading(true);
    try {
      const invoice = await createInvoice({
        client_id: clientId,
        due_date: dueDate || undefined,
        is_bill_of_charges: isBillOfCharges,
      });
      toast.success('Draft invoice created');
      onOpenChange(false);
      onCreated(invoice);
    } catch (err) {
      handleApiError(err, 'Unable to create invoice.');
    } finally {
      submittingRef.current = false;
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>New Invoice</DialogTitle>
          <DialogDescription>
            Pick the client to bill. You&apos;ll add line items and tax settings on the next screen.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="invoice-client">Client <span className="text-red-500">*</span></Label>
            <Select value={clientId} onValueChange={(v) => { setClientId(v); setError(null); }}>
              <SelectTrigger id="invoice-client" className={error ? 'border-red-300 focus-visible:ring-red-300' : ''}>
                <SelectValue placeholder="Select a client" />
              </SelectTrigger>
              <SelectContent>
                {clients.filter((c) => c.is_active).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {error && <p className="text-sm text-red-500">{error}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="invoice-due-date">Due Date (optional)</Label>
            <Input id="invoice-due-date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={isBillOfCharges} onCheckedChange={(v) => setIsBillOfCharges(!!v)} />
            Formal Bill of Charges
          </label>
          <DialogFooter className="gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isLoading} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {isLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating...</> : 'Create Draft'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
