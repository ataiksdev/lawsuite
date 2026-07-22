'use client';

import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { handleApiError } from '@/lib/error-utils';
import { recordPayment, type BackendPayment, type PaymentMethod } from '@/lib/api/invoice-payments';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface PaymentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  balanceDueKobo: number;
  onSave: (payment: BackendPayment) => void;
}

const METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cash', label: 'Cash' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'paystack', label: 'Paystack (collected outside the app)' },
];

export function PaymentFormDialog({ open, onOpenChange, invoiceId, balanceDueKobo, onSave }: PaymentFormDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ amount?: string; reference?: string }>({});

  const [amountNaira, setAmountNaira] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('bank_transfer');
  const [paidAt, setPaidAt] = useState('');
  const [reference, setReference] = useState('');
  const [whtWithheldNaira, setWhtWithheldNaira] = useState('');
  const [whtCreditNoteReceived, setWhtCreditNoteReceived] = useState(false);

  useEffect(() => {
    if (open) {
      setAmountNaira((balanceDueKobo / 100).toFixed(2));
      setMethod('bank_transfer');
      setPaidAt(new Date().toISOString().slice(0, 10));
      setReference('');
      setWhtWithheldNaira('');
      setWhtCreditNoteReceived(false);
      setErrors({});
    }
  }, [open, balanceDueKobo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(amountNaira);
    const nextErrors: { amount?: string; reference?: string } = {};
    if (!amount || amount <= 0) nextErrors.amount = 'Enter a valid amount.';
    if (!reference.trim()) nextErrors.reference = 'A reference is required.';
    if (Object.keys(nextErrors).length > 0) { setErrors(nextErrors); return; }

    setIsLoading(true);
    try {
      const whtWithheld = Number(whtWithheldNaira);
      const payment = await recordPayment({
        invoice_id: invoiceId,
        amount_kobo: Math.round(amount * 100),
        method,
        paid_at: new Date(paidAt).toISOString(),
        reference: reference.trim(),
        wht_withheld_kobo: whtWithheldNaira && whtWithheld >= 0 ? Math.round(whtWithheld * 100) : undefined,
        wht_credit_note_received: whtCreditNoteReceived,
      });
      toast.success('Payment recorded');
      onSave(payment);
      onOpenChange(false);
    } catch (err) {
      handleApiError(err, 'Unable to record payment.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
          <DialogDescription>
            Record a payment received against this invoice — partial payments are fine.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="payment-amount">Amount (₦) <span className="text-red-500">*</span></Label>
            <Input
              id="payment-amount"
              type="number"
              step="0.01"
              min="0"
              value={amountNaira}
              onChange={(e) => { setAmountNaira(e.target.value); if (errors.amount) setErrors((p) => ({ ...p, amount: undefined })); }}
              className={cn(errors.amount && 'border-red-300 focus-visible:ring-red-300')}
            />
            <p className="text-xs text-slate-500">Defaults to the outstanding balance — edit for a partial payment.</p>
            {errors.amount && <p className="text-sm text-red-500">{errors.amount}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Method</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {METHOD_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="payment-date">Paid At</Label>
              <Input id="payment-date" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="payment-reference">Reference <span className="text-red-500">*</span></Label>
            <Input
              id="payment-reference"
              value={reference}
              onChange={(e) => { setReference(e.target.value); if (errors.reference) setErrors((p) => ({ ...p, reference: undefined })); }}
              placeholder="Bank transfer ref, receipt no., etc."
              className={cn(errors.reference && 'border-red-300 focus-visible:ring-red-300')}
            />
            {errors.reference && <p className="text-sm text-red-500">{errors.reference}</p>}
          </div>

          <div className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <Label htmlFor="payment-wht-withheld">WHT withheld by client (₦, optional)</Label>
            <Input
              id="payment-wht-withheld"
              type="number"
              step="0.01"
              min="0"
              value={whtWithheldNaira}
              onChange={(e) => setWhtWithheldNaira(e.target.value)}
            />
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={whtCreditNoteReceived} onCheckedChange={(v) => setWhtCreditNoteReceived(!!v)} />
              WHT credit note received
            </label>
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isLoading} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {isLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Recording...</> : 'Record Payment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
