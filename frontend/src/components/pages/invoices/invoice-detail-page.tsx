'use client';

import React, { useEffect, useState } from 'react';
import {
  ArrowLeft, Loader2, Plus, Pencil, Trash2, Download, Send, Ban, FileCheck, ShieldAlert, Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn, formatNaira } from '@/lib/utils';
import { navigate, useRouteParams } from '@/lib/router';
import { useAuthStore } from '@/lib/auth-store';
import { UserRole } from '@/lib/types';
import { handleApiError, extractErrorMessage } from '@/lib/error-utils';
import {
  getInvoice, issueInvoice, voidInvoice, deleteInvoice, markServed, deleteLineItem, updateInvoice, getInvoicePdfBlob,
  type BackendInvoice, type BackendInvoiceLineItem,
} from '@/lib/api/invoices';
import { listPayments, type BackendPayment } from '@/lib/api/invoice-payments';
import { listMatters, type BackendMatter } from '@/lib/api/matters';
import { getClient, type BackendClient } from '@/lib/api/clients';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';

import { InvoiceStatusBadge } from './components/invoice-status-badge';
import { LineItemFormDialog } from './components/line-item-form-dialog';
import { PaymentFormDialog } from './components/payment-form-dialog';

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium text-slate-400 dark:text-slate-500">{label}</span>
      <span className="text-sm text-slate-700 dark:text-slate-300">{value || '—'}</span>
    </div>
  );
}

// Recommended rates (must match backend/app/services/tax_engine.py) — used
// only as a placeholder when there's no base yet to derive a real percentage from.
const DEFAULT_VAT_PERCENT = 7.5;
const DEFAULT_WHT_PERCENT = 5;

function vatableBaseKobo(inv: BackendInvoice): number {
  return inv.line_items.filter((li) => li.is_vatable).reduce((sum, li) => sum + li.amount_kobo, 0);
}

function whtBaseKobo(inv: BackendInvoice): number {
  return inv.line_items
    .filter((li) => li.kind === 'professional_fee' && li.is_wht_applicable)
    .reduce((sum, li) => sum + li.amount_kobo, 0);
}

function percentFromKobo(amountKobo: number, baseKobo: number, fallbackPercent: number): string {
  if (baseKobo <= 0) return fallbackPercent.toFixed(2);
  return ((amountKobo / baseKobo) * 100).toFixed(2);
}

export function InvoiceDetailPage() {
  const params = useRouteParams();
  const invoiceId = params.id;
  const { user } = useAuthStore();
  const isAdmin = user?.role === UserRole.ADMIN;

  const [invoice, setInvoice] = useState<BackendInvoice | null>(null);
  const [client, setClient] = useState<BackendClient | null>(null);
  const [matters, setMatters] = useState<BackendMatter[]>([]);
  const [payments, setPayments] = useState<BackendPayment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [showLineItemDialog, setShowLineItemDialog] = useState(false);
  const [editingLineItem, setEditingLineItem] = useState<BackendInvoiceLineItem | null>(null);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showVoidDialog, setShowVoidDialog] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showServedDialog, setShowServedDialog] = useState(false);
  const [servedAtInput, setServedAtInput] = useState(() => new Date().toISOString().slice(0, 10));
  const [vatOverride, setVatOverride] = useState('');
  const [whtOverride, setWhtOverride] = useState('');
  const [dueDateInput, setDueDateInput] = useState('');
  const [notesInput, setNotesInput] = useState('');

  const syncTaxOverrideInputs = (inv: BackendInvoice) => {
    setVatOverride(percentFromKobo(inv.vat_kobo, vatableBaseKobo(inv), DEFAULT_VAT_PERCENT));
    setWhtOverride(percentFromKobo(inv.wht_kobo, whtBaseKobo(inv), DEFAULT_WHT_PERCENT));
  };

  const load = React.useCallback(async () => {
    if (!invoiceId || !isAdmin) { setIsLoading(false); return; }
    setIsLoading(true);
    setError(null);
    try {
      const [inv, mattersRes] = await Promise.all([
        getInvoice(invoiceId),
        listMatters({ page_size: 100 }),
      ]);
      setInvoice(inv);
      setMatters(mattersRes.items);
      syncTaxOverrideInputs(inv);
      setDueDateInput(inv.due_date || '');
      setNotesInput(inv.notes || '');
      const [clientRes, paymentsRes] = await Promise.all([
        getClient(inv.client_id),
        listPayments(invoiceId),
      ]);
      setClient(clientRes);
      setPayments(paymentsRes);
    } catch (err) {
      setError(extractErrorMessage(err, 'Unable to load this invoice.'));
    } finally {
      setIsLoading(false);
    }
  }, [invoiceId, isAdmin]);

  useEffect(() => { void load(); }, [load]);

  const matterTitleById = React.useMemo(() => {
    const map = new Map<string, string>();
    matters.forEach((m) => map.set(m.id, m.title));
    return map;
  }, [matters]);

  if (!isAdmin) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <ShieldAlert className="h-8 w-8 text-slate-400" />
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Admin access required</p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading invoice...
        </CardContent>
      </Card>
    );
  }

  if (error || !invoice) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{error || 'Invoice not found.'}</p>
          <Button variant="outline" onClick={() => navigate('/admin/invoices')}>Back to Invoices</Button>
        </CardContent>
      </Card>
    );
  }

  const isDraft = invoice.status === 'draft';
  const canVoid = ['draft', 'sent', 'part_paid', 'overdue'].includes(invoice.status) && invoice.amount_paid_kobo === 0;
  const canDelete = isDraft && invoice.line_items.length === 0;
  const canRecordPayment = ['sent', 'part_paid', 'overdue'].includes(invoice.status);
  const canMarkServed = invoice.is_bill_of_charges && !isDraft && !invoice.served_at;
  const balanceDueKobo = invoice.net_payable_kobo - invoice.amount_paid_kobo;
  const currentVatBaseKobo = vatableBaseKobo(invoice);
  const currentWhtBaseKobo = whtBaseKobo(invoice);

  const handleIssue = async () => {
    setBusyAction('issue');
    try {
      const updated = await issueInvoice(invoice.id);
      setInvoice(updated);
      toast.success(`Invoice issued as ${updated.number}`);
    } catch (err) {
      handleApiError(err, 'Unable to issue invoice.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleVoid = async () => {
    setBusyAction('void');
    try {
      const updated = await voidInvoice(invoice.id, voidReason.trim() || undefined);
      setInvoice(updated);
      toast.success('Invoice voided');
      setShowVoidDialog(false);
      setVoidReason('');
    } catch (err) {
      handleApiError(err, 'Unable to void invoice.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleDelete = async () => {
    setBusyAction('delete');
    try {
      await deleteInvoice(invoice.id);
      toast.success('Empty draft invoice deleted');
      navigate('/admin/invoices');
    } catch (err) {
      handleApiError(err, 'Unable to delete this invoice.');
      setBusyAction(null);
    }
  };

  const handleMarkServed = async () => {
    setBusyAction('serve');
    try {
      const servedAtIso = servedAtInput ? new Date(servedAtInput).toISOString() : undefined;
      const updated = await markServed(invoice.id, servedAtIso);
      setInvoice(updated);
      toast.success('Marked as served');
      setShowServedDialog(false);
    } catch (err) {
      handleApiError(err, 'Unable to mark as served.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleDownloadPdf = async () => {
    setBusyAction('pdf');
    // Open the tab synchronously on the click so browsers don't treat the
    // later location assignment (after the await below) as a blocked popup.
    const pdfWindow = window.open('', '_blank');
    try {
      const blob = await getInvoicePdfBlob(invoice.id);
      const url = URL.createObjectURL(blob);
      if (pdfWindow) pdfWindow.location.href = url;
    } catch (err) {
      pdfWindow?.close();
      handleApiError(err, 'Unable to generate PDF.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleDeleteLineItem = async (lineItemId: string) => {
    setBusyAction(`delete-${lineItemId}`);
    try {
      const updated = await deleteLineItem(invoice.id, lineItemId);
      setInvoice(updated);
      syncTaxOverrideInputs(updated);
      toast.success('Line item removed');
    } catch (err) {
      handleApiError(err, 'Unable to remove line item.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleToggleTax = async (field: 'vat_enabled' | 'wht_enabled', value: boolean) => {
    setBusyAction(field);
    try {
      const updated = await updateInvoice(invoice.id, { [field]: value });
      setInvoice(updated);
      syncTaxOverrideInputs(updated);
    } catch (err) {
      handleApiError(err, 'Unable to update invoice.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleUpdateDueDate = async () => {
    setBusyAction('due_date');
    try {
      const updated = await updateInvoice(invoice.id, { due_date: dueDateInput || null });
      setInvoice(updated);
      toast.success('Due date updated');
    } catch (err) {
      handleApiError(err, 'Unable to update due date.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleUpdateNotes = async () => {
    setBusyAction('notes');
    try {
      const updated = await updateInvoice(invoice.id, { notes: notesInput.trim() || null });
      setInvoice(updated);
      toast.success('Notes updated');
    } catch (err) {
      handleApiError(err, 'Unable to update notes.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleApplyOverride = async (field: 'vat_kobo' | 'wht_kobo', percentStr: string) => {
    const percent = Number(percentStr);
    if (Number.isNaN(percent) || percent < 0) { toast.error('Enter a valid percentage.'); return; }
    const baseKobo = field === 'vat_kobo' ? currentVatBaseKobo : currentWhtBaseKobo;
    const overrideKobo = Math.round(baseKobo * (percent / 100));
    setBusyAction(field);
    try {
      const updated = await updateInvoice(invoice.id, { [field]: overrideKobo });
      setInvoice(updated);
      toast.success('Override applied');
    } catch (err) {
      handleApiError(err, 'Unable to apply override.');
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Button variant="ghost" size="sm" className="mb-2 -ml-2 h-8 text-xs" onClick={() => navigate('/admin/invoices')}>
            <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back to Invoices
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="page-title">{invoice.number || 'Draft Invoice'}</h1>
            <InvoiceStatusBadge status={invoice.status} />
          </div>
          <p className="page-description">
            {client?.name || '—'} · Issued {invoice.issue_date}
            {!isDraft && invoice.due_date && ` · Due ${invoice.due_date}`}
          </p>
          {isDraft && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-slate-500">Due date</span>
              <Input
                type="date"
                value={dueDateInput}
                onChange={(e) => setDueDateInput(e.target.value)}
                className="h-8 w-40 text-xs"
              />
              <Button
                size="sm" variant="outline" className="h-8 shrink-0 text-xs"
                disabled={busyAction === 'due_date' || dueDateInput === (invoice.due_date || '')}
                onClick={() => void handleUpdateDueDate()}
              >
                {busyAction === 'due_date' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
              </Button>
            </div>
          )}
          {invoice.matter_ids.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {invoice.matter_ids.map((id) => (
                <span key={id} className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600 dark:border-slate-700 dark:text-slate-400">
                  {matterTitleById.get(id) || id.slice(0, 8)}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {isDraft && (
            <Button
              size="sm"
              disabled={busyAction === 'issue' || invoice.line_items.length === 0}
              onClick={() => void handleIssue()}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {busyAction === 'issue' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
              Issue
            </Button>
          )}
          {canRecordPayment && (
            <Button size="sm" variant="outline" onClick={() => setShowPaymentDialog(true)}>
              <Wallet className="mr-1.5 h-3.5 w-3.5" /> Record Payment
            </Button>
          )}
          {canMarkServed && (
            <Button
              size="sm" variant="outline"
              onClick={() => { setServedAtInput(new Date().toISOString().slice(0, 10)); setShowServedDialog(true); }}
            >
              <FileCheck className="mr-1.5 h-3.5 w-3.5" />
              Mark Served
            </Button>
          )}
          <Button size="sm" variant="outline" disabled={busyAction === 'pdf'} onClick={() => void handleDownloadPdf()}>
            {busyAction === 'pdf' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" />}
            Download PDF
          </Button>
          {canVoid && (
            <Button size="sm" variant="outline" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => setShowVoidDialog(true)}>
              <Ban className="mr-1.5 h-3.5 w-3.5" /> Void
            </Button>
          )}
          {canDelete && (
            <Button size="sm" variant="outline" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => setShowDeleteDialog(true)}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
            </Button>
          )}
        </div>
      </div>

      {invoice.is_bill_of_charges && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-300">
          Formal Bill of Charges.
          {invoice.served_at ? (
            <>
              {' '}Served {new Date(invoice.served_at).toLocaleDateString()}
              {invoice.eligible_to_sue_date && ` — eligible to pursue recovery from ${invoice.eligible_to_sue_date}.`}
            </>
          ) : (
            ' Not yet marked as served.'
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="shadow-sm lg:col-span-2">
          <CardContent className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-900 dark:text-slate-100">Line Items</h3>
              {isDraft && (
                <Button size="sm" className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => { setEditingLineItem(null); setShowLineItemDialog(true); }}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add Line Item
                </Button>
              )}
            </div>
            {invoice.line_items.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">No line items yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Description</TableHead>
                      <TableHead>Matter</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Unit</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      {isDraft && <TableHead className="w-[80px]" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoice.line_items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <p className="font-medium">{item.description}</p>
                          <p className="text-xs text-slate-400">{item.kind.replace('_', ' ')}</p>
                        </TableCell>
                        <TableCell className="text-sm text-slate-500">
                          {item.matter_id ? (matterTitleById.get(item.matter_id) || '—') : '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{item.quantity}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatNaira(item.unit_amount_kobo, invoice.currency)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatNaira(item.amount_kobo, invoice.currency)}</TableCell>
                        {isDraft && (
                          <TableCell>
                            <div className="flex justify-end gap-1">
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingLineItem(item); setShowLineItemDialog(true); }}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-600"
                                disabled={busyAction === `delete-${item.id}`}
                                onClick={() => void handleDeleteLineItem(item.id)}
                              >
                                {busyAction === `delete-${item.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="space-y-4 p-6">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-900 dark:text-slate-100">Tax</h3>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-700 dark:text-slate-300">VAT enabled</span>
              <Switch checked={invoice.vat_enabled} disabled={!isDraft || busyAction === 'vat_enabled'} onCheckedChange={(v) => void handleToggleTax('vat_enabled', v)} />
            </div>
            {isDraft && (
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Input type="number" step="0.01" min="0" value={vatOverride} onChange={(e) => setVatOverride(e.target.value)} className="h-8 pr-6 text-xs" />
                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">%</span>
                </div>
                <Button size="sm" variant="outline" className="h-8 shrink-0 text-xs" disabled={busyAction === 'vat_kobo'} onClick={() => void handleApplyOverride('vat_kobo', vatOverride)}>
                  Override
                </Button>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-700 dark:text-slate-300">WHT enabled</span>
              <Switch checked={invoice.wht_enabled} disabled={!isDraft || busyAction === 'wht_enabled'} onCheckedChange={(v) => void handleToggleTax('wht_enabled', v)} />
            </div>
            {isDraft && (
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Input type="number" step="0.01" min="0" value={whtOverride} onChange={(e) => setWhtOverride(e.target.value)} className="h-8 pr-6 text-xs" />
                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">%</span>
                </div>
                <Button size="sm" variant="outline" className="h-8 shrink-0 text-xs" disabled={busyAction === 'wht_kobo'} onClick={() => void handleApplyOverride('wht_kobo', whtOverride)}>
                  Override
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="space-y-2 p-6">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-900 dark:text-slate-100">Totals</h3>
            {[
              ['Subtotal', invoice.subtotal_kobo],
              ['Disbursements', invoice.disbursements_kobo],
              ['VAT', invoice.vat_kobo],
              ['Total', invoice.total_kobo],
              ['Less: WHT', -invoice.wht_kobo],
            ].map(([label, kobo]) => (
              <div key={label as string} className="flex items-center justify-between text-sm">
                <span className="text-slate-500">{label}</span>
                <span className="tabular-nums">{formatNaira(kobo as number, invoice.currency)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-sm font-semibold dark:border-slate-700">
              <span>Net Payable</span>
              <span className="tabular-nums">{formatNaira(invoice.net_payable_kobo, invoice.currency)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Amount Paid</span>
              <span className="tabular-nums">{formatNaira(invoice.amount_paid_kobo, invoice.currency)}</span>
            </div>
            <div className="flex items-center justify-between text-sm font-semibold">
              <span>Balance Due</span>
              <span className={cn('tabular-nums', balanceDueKobo > 0 && 'text-amber-600')}>{formatNaira(balanceDueKobo, invoice.currency)}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm lg:col-span-2">
          <CardContent className="p-6">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-900 dark:text-slate-100">Payments</h3>
            {payments.length === 0 ? (
              <p className="text-sm text-slate-400">No payments recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-lg border border-slate-100 p-3 text-sm dark:border-slate-800">
                    <div>
                      <p className="font-medium">{formatNaira(p.amount_kobo, invoice.currency)}</p>
                      <p className="text-xs text-slate-400">{p.method.replace('_', ' ')} · {p.reference} · {new Date(p.paid_at).toLocaleDateString()}</p>
                      {!!p.wht_withheld_kobo && (
                        <p className="text-xs text-slate-400">
                          WHT withheld {formatNaira(p.wht_withheld_kobo, invoice.currency)}
                          {p.wht_credit_note_received ? ' · credit note received' : ' · credit note pending'}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {(isDraft || invoice.notes) && (
          <Card className="shadow-sm lg:col-span-2">
            <CardContent className="space-y-2 p-6">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-900 dark:text-slate-100">Notes</h3>
              {isDraft ? (
                <>
                  <Textarea value={notesInput} onChange={(e) => setNotesInput(e.target.value)} rows={3} placeholder="Internal notes about this invoice (not shown on the PDF)." />
                  <Button
                    size="sm" variant="outline" className="h-8 text-xs"
                    disabled={busyAction === 'notes' || notesInput.trim() === (invoice.notes || '')}
                    onClick={() => void handleUpdateNotes()}
                  >
                    {busyAction === 'notes' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
                  </Button>
                </>
              ) : (
                <p className="whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-400">{invoice.notes}</p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <LineItemFormDialog
        open={showLineItemDialog}
        onOpenChange={setShowLineItemDialog}
        invoiceId={invoice.id}
        matters={matters}
        lineItem={editingLineItem}
        onSave={(updated) => { setInvoice(updated); syncTaxOverrideInputs(updated); }}
      />

      <PaymentFormDialog
        open={showPaymentDialog}
        onOpenChange={setShowPaymentDialog}
        invoiceId={invoice.id}
        balanceDueKobo={balanceDueKobo}
        onSave={() => void load()}
      />

      <AlertDialog open={showVoidDialog} onOpenChange={setShowVoidDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void this invoice?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone. Optionally provide a reason for the record.</AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="Reason (optional)" rows={2} />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => void handleVoid()} disabled={busyAction === 'void'}>
              Void Invoice
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this draft invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              This invoice has no line items and is permanently deleted, not archived — this cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => void handleDelete()} disabled={busyAction === 'delete'}>
              Delete Invoice
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showServedDialog} onOpenChange={setShowServedDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark as served?</AlertDialogTitle>
            <AlertDialogDescription>
              Records the date this Bill of Charges was served on the client — defaults to today, but can be backdated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input type="date" value={servedAtInput} onChange={(e) => setServedAtInput(e.target.value)} />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleMarkServed()} disabled={busyAction === 'serve'}>
              Mark Served
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
