'use client';

import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn, formatNaira } from '@/lib/utils';
import { handleApiError } from '@/lib/error-utils';
import { addLineItem, updateLineItem, type BackendInvoice, type BackendInvoiceLineItem, type LineItemKind } from '@/lib/api/invoices';
import { listFeeArrangements, type BackendFeeArrangement } from '@/lib/api/fee-arrangements';
import { listDisbursements, type BackendDisbursement } from '@/lib/api/disbursements';
import type { BackendMatter } from '@/lib/api/matters';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface LineItemFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  matters: BackendMatter[];
  lineItem?: BackendInvoiceLineItem | null;
  onSave: (invoice: BackendInvoice) => void;
}

const KIND_OPTIONS: { value: LineItemKind; label: string }[] = [
  { value: 'professional_fee', label: 'Professional Fee' },
  { value: 'disbursement', label: 'Disbursement' },
  { value: 'expense', label: 'Expense' },
];

const NONE = '__none__';

export function LineItemFormDialog({ open, onOpenChange, invoiceId, matters, lineItem, onSave }: LineItemFormDialogProps) {
  const isEdit = !!lineItem;
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [kind, setKind] = useState<LineItemKind>('professional_fee');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitAmountNaira, setUnitAmountNaira] = useState('');
  const [matterId, setMatterId] = useState<string>(NONE);
  const [feeArrangementId, setFeeArrangementId] = useState<string>(NONE);
  const [disbursementId, setDisbursementId] = useState<string>(NONE);
  const [isVatable, setIsVatable] = useState(true);
  const [isWhtApplicable, setIsWhtApplicable] = useState(true);
  const [notes, setNotes] = useState('');

  const [feeArrangements, setFeeArrangements] = useState<BackendFeeArrangement[]>([]);
  const [unbilledDisbursements, setUnbilledDisbursements] = useState<BackendDisbursement[]>([]);

  useEffect(() => {
    if (open) {
      setKind(lineItem?.kind || 'professional_fee');
      setDescription(lineItem?.description || '');
      setQuantity(lineItem ? String(lineItem.quantity) : '1');
      setUnitAmountNaira(lineItem ? String(lineItem.unit_amount_kobo / 100) : '');
      setMatterId(lineItem?.matter_id || NONE);
      setFeeArrangementId(lineItem?.fee_arrangement_id || NONE);
      setDisbursementId(NONE);
      setIsVatable(lineItem?.is_vatable ?? true);
      setIsWhtApplicable(lineItem?.is_wht_applicable ?? true);
      setNotes(lineItem?.notes || '');
      setError(null);
    }
  }, [open, lineItem]);

  // Fetch fee arrangements + unbilled disbursements whenever the chosen matter changes.
  useEffect(() => {
    if (matterId === NONE) {
      setFeeArrangements([]);
      setUnbilledDisbursements([]);
      return;
    }
    let cancelled = false;
    Promise.all([listFeeArrangements(matterId), listDisbursements(matterId, true)])
      .then(([arrangements, disbursements]) => {
        if (!cancelled) {
          setFeeArrangements(arrangements);
          setUnbilledDisbursements(disbursements);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [matterId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (disbursementId === NONE) {
      if (!description.trim()) { setError('Description is required.'); return; }
      const unitAmount = Number(unitAmountNaira);
      if (!unitAmount || unitAmount <= 0) { setError('Enter a valid unit amount.'); return; }
    }
    setIsLoading(true);
    try {
      let invoice: BackendInvoice;
      if (disbursementId !== NONE && !isEdit) {
        invoice = await addLineItem(invoiceId, { kind: 'disbursement', description: '', unit_amount_kobo: 0, disbursement_id: disbursementId });
      } else if (isEdit && lineItem) {
        invoice = await updateLineItem(invoiceId, lineItem.id, {
          kind,
          description: description.trim(),
          quantity: Number(quantity) || 1,
          unit_amount_kobo: Math.round(Number(unitAmountNaira) * 100),
          matter_id: matterId === NONE ? null : matterId,
          fee_arrangement_id: feeArrangementId === NONE ? null : feeArrangementId,
          is_vatable: isVatable,
          is_wht_applicable: isWhtApplicable,
          notes: notes.trim() || undefined,
        });
      } else {
        invoice = await addLineItem(invoiceId, {
          kind,
          description: description.trim(),
          quantity: Number(quantity) || 1,
          unit_amount_kobo: Math.round(Number(unitAmountNaira) * 100),
          matter_id: matterId === NONE ? undefined : matterId,
          fee_arrangement_id: feeArrangementId === NONE ? undefined : feeArrangementId,
          is_vatable: isVatable,
          is_wht_applicable: isWhtApplicable,
          notes: notes.trim() || undefined,
        });
      }
      toast.success(isEdit ? 'Line item updated' : 'Line item added');
      onSave(invoice);
      onOpenChange(false);
    } catch (err) {
      handleApiError(err, 'Unable to save line item.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Line Item' : 'Add Line Item'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update this line item.' : 'Add a fee, disbursement, or expense to this draft invoice.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Matter (optional)</Label>
            <Select value={matterId} onValueChange={(v) => { setMatterId(v); setFeeArrangementId(NONE); setDisbursementId(NONE); }}>
              <SelectTrigger><SelectValue placeholder="No matter (firm-level line)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No matter (firm-level line)</SelectItem>
                {matters.map((m) => <SelectItem key={m.id} value={m.id}>{m.reference_no} — {m.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {!isEdit && matterId !== NONE && unbilledDisbursements.length > 0 && (
            <div className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <Label>Pull from unbilled disbursement (optional)</Label>
              <Select value={disbursementId} onValueChange={setDisbursementId}>
                <SelectTrigger><SelectValue placeholder="Enter details manually instead" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Enter details manually instead</SelectItem>
                  {unbilledDisbursements.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.description} — {formatNaira(d.amount_kobo)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {disbursementId !== NONE && (
                <p className="text-xs text-slate-500">Description, amount, and type will be filled in from the disbursement automatically.</p>
              )}
            </div>
          )}

          {disbursementId === NONE && (
            <>
              {matterId !== NONE && feeArrangements.length > 0 && (
                <div className="space-y-2">
                  <Label>Fee Arrangement (optional)</Label>
                  <Select value={feeArrangementId} onValueChange={setFeeArrangementId}>
                    <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>None</SelectItem>
                      {feeArrangements.map((fa) => (
                        <SelectItem key={fa.id} value={fa.id}>{fa.type} {fa.is_active ? '(active)' : ''}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label>Kind</Label>
                <Select value={kind} onValueChange={(v) => setKind(v as LineItemKind)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {KIND_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="li-description">Description <span className="text-red-500">*</span></Label>
                <Input
                  id="li-description"
                  value={description}
                  onChange={(e) => { setDescription(e.target.value); if (error) setError(null); }}
                  className={cn(error && 'border-red-300 focus-visible:ring-red-300')}
                />
              </div>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="li-quantity">Quantity</Label>
                  <Input id="li-quantity" type="number" step="0.01" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="li-unit-amount">Unit Amount (₦) <span className="text-red-500">*</span></Label>
                  <Input
                    id="li-unit-amount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={unitAmountNaira}
                    onChange={(e) => { setUnitAmountNaira(e.target.value); if (error) setError(null); }}
                    className={cn(error && 'border-red-300 focus-visible:ring-red-300')}
                  />
                </div>
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}

              <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={isVatable} onCheckedChange={(v) => setIsVatable(!!v)} />
                  VAT applicable
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={isWhtApplicable} onCheckedChange={(v) => setIsWhtApplicable(!!v)} />
                  WHT applicable
                </label>
              </div>

              <div className="space-y-2">
                <Label htmlFor="li-notes">Notes</Label>
                <Textarea id="li-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              </div>
            </>
          )}

          <DialogFooter className="gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isLoading} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {isLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : isEdit ? 'Update Line Item' : 'Add Line Item'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
