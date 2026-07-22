'use client';

import React, { useEffect, useState } from 'react';
import { Loader2, Plus, Receipt, ScrollText, Trash2, ExternalLink, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { cn, formatNaira } from '@/lib/utils';
import { navigate } from '@/lib/router';
import { useAuthStore } from '@/lib/auth-store';
import { UserRole } from '@/lib/types';
import { handleApiError } from '@/lib/error-utils';
import {
  listFeeArrangements, createFeeArrangement, type BackendFeeArrangement, type FeeArrangementType,
} from '@/lib/api/fee-arrangements';
import {
  listDisbursements, createDisbursement, deleteDisbursement, type BackendDisbursement, type DisbursementType,
} from '@/lib/api/disbursements';
import { listInvoices, type BackendInvoice } from '@/lib/api/invoices';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

import { InvoiceStatusBadge } from '@/components/pages/invoices/components/invoice-status-badge';

const FEE_ARRANGEMENT_LABELS: Record<FeeArrangementType, string> = {
  fixed: 'Fixed Fee',
  retainer: 'Retainer',
  scale: 'Scale Fee',
  milestone: 'Milestone',
  recovery: 'Recovery (contingency)',
  appearance: 'Per Appearance',
};

export function MatterBillingSection({ matterId }: { matterId: string }) {
  const { user } = useAuthStore();
  const isAdmin = user?.role === UserRole.ADMIN;

  if (!isAdmin) {
    return (
      <Card className="shadow-sm lg:col-span-2">
        <CardContent className="flex items-center gap-3 p-6 text-sm text-slate-500">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          Billing (fee arrangements, disbursements, invoices) is restricted to organisation admins.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <FeeArrangementCard matterId={matterId} />
      <DisbursementsCard matterId={matterId} />
      <MatterInvoicesCard matterId={matterId} />
    </>
  );
}

// ============================================================================
// Fee Arrangement
// ============================================================================

function FeeArrangementCard({ matterId }: { matterId: string }) {
  const [arrangements, setArrangements] = useState<BackendFeeArrangement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [type, setType] = useState<FeeArrangementType>('fixed');
  const [amountNaira, setAmountNaira] = useState('');
  const [description, setDescription] = useState('');

  const load = React.useCallback(() => {
    setIsLoading(true);
    listFeeArrangements(matterId)
      .then(setArrangements)
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [matterId]);

  useEffect(() => { load(); }, [load]);

  const active = arrangements.find((a) => a.is_active);
  const usesAmount = type === 'fixed' || type === 'retainer' || type === 'scale';

  const handleCreate = async () => {
    setSaving(true);
    try {
      const params: Record<string, unknown> = usesAmount
        ? { amount_kobo: Math.round((Number(amountNaira) || 0) * 100) }
        : { description: description.trim() };
      await createFeeArrangement(matterId, { type, params });
      toast.success('Fee arrangement saved');
      setAmountNaira('');
      setDescription('');
      load();
    } catch (err) {
      handleApiError(err, 'Unable to save fee arrangement.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="shadow-sm lg:col-span-2">
      <CardContent className="space-y-4 p-6">
        <div className="flex items-center gap-2">
          <ScrollText className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-900 dark:text-slate-100">Fee Arrangement</h3>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 py-2 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</div>
        ) : active ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-800 dark:bg-emerald-950/20">
            <p className="font-medium text-emerald-800 dark:text-emerald-300">{FEE_ARRANGEMENT_LABELS[active.type]} (active)</p>
            <p className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-400">
              {typeof active.params.amount_kobo === 'number'
                ? formatNaira(active.params.amount_kobo)
                : String(active.params.description || '—')}
            </p>
          </div>
        ) : (
          <p className="text-sm text-slate-500">No fee arrangement set for this matter yet.</p>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-2 sm:col-span-1">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as FeeArrangementType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(FEE_ARRANGEMENT_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {usesAmount ? (
            <div className="space-y-2 sm:col-span-2">
              <Label>Amount (₦)</Label>
              <Input type="number" step="0.01" min="0" value={amountNaira} onChange={(e) => setAmountNaira(e.target.value)} />
            </div>
          ) : (
            <div className="space-y-2 sm:col-span-2">
              <Label>Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
            </div>
          )}
        </div>
        <Button size="sm" className="h-8 bg-emerald-600 text-xs text-white hover:bg-emerald-700" disabled={saving} onClick={() => void handleCreate()}>
          {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
          {active ? 'Change Arrangement' : 'Set Arrangement'}
        </Button>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Disbursements
// ============================================================================

function DisbursementsCard({ matterId }: { matterId: string }) {
  const [disbursements, setDisbursements] = useState<BackendDisbursement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [type, setType] = useState<DisbursementType>('agency');
  const [description, setDescription] = useState('');
  const [amountNaira, setAmountNaira] = useState('');
  const [incurredAt, setIncurredAt] = useState(new Date().toISOString().slice(0, 10));

  const load = React.useCallback(() => {
    setIsLoading(true);
    listDisbursements(matterId)
      .then(setDisbursements)
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [matterId]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!description.trim() || !amountNaira) { toast.error('Description and amount are required.'); return; }
    setSaving(true);
    try {
      await createDisbursement(matterId, {
        type,
        description: description.trim(),
        amount_kobo: Math.round(Number(amountNaira) * 100),
        incurred_at: incurredAt,
      });
      toast.success('Disbursement recorded');
      setDescription('');
      setAmountNaira('');
      load();
    } catch (err) {
      handleApiError(err, 'Unable to record disbursement.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteDisbursement(matterId, id);
      toast.success('Disbursement removed');
      load();
    } catch (err) {
      handleApiError(err, 'Unable to remove disbursement.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Card className="shadow-sm lg:col-span-2">
      <CardContent className="space-y-4 p-6">
        <div className="flex items-center gap-2">
          <Receipt className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-900 dark:text-slate-100">Disbursements</h3>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as DisbursementType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="agency">Agency (not VATable)</SelectItem>
                <SelectItem value="recharge">Recharge (VATable)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Court filing fee, courier, etc." />
          </div>
          <div className="space-y-2">
            <Label>Amount (₦)</Label>
            <Input type="number" step="0.01" min="0" value={amountNaira} onChange={(e) => setAmountNaira(e.target.value)} />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Input type="date" value={incurredAt} onChange={(e) => setIncurredAt(e.target.value)} className="w-40" />
          <Button size="sm" className="h-8 bg-emerald-600 text-xs text-white hover:bg-emerald-700" disabled={saving} onClick={() => void handleCreate()}>
            {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
            Add Disbursement
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 py-2 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</div>
        ) : disbursements.length === 0 ? (
          <p className="text-sm text-slate-500">No disbursements recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {disbursements.map((d) => (
              <div key={d.id} className="flex items-center justify-between rounded-lg border border-slate-100 p-3 text-sm dark:border-slate-800">
                <div>
                  <p className="font-medium">{d.description} <span className="text-xs font-normal text-slate-400">({d.type})</span></p>
                  <p className="text-xs text-slate-400">{formatNaira(d.amount_kobo)} · {d.incurred_at}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={cn('text-[10px]', d.invoiced && 'border-emerald-200 text-emerald-700')}>
                    {d.invoiced ? 'Invoiced' : 'Unbilled'}
                  </Badge>
                  <Button
                    size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-600"
                    disabled={d.invoiced || deletingId === d.id}
                    onClick={() => void handleDelete(d.id)}
                  >
                    {deletingId === d.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Invoices covering this matter (read-only)
// ============================================================================

function MatterInvoicesCard({ matterId }: { matterId: string }) {
  const [invoices, setInvoices] = useState<BackendInvoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    listInvoices({ matter_id: matterId, page_size: 50 })
      .then((res) => { if (!cancelled) setInvoices(res.items); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [matterId]);

  return (
    <Card className="shadow-sm lg:col-span-2">
      <CardContent className="space-y-3 p-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-900 dark:text-slate-100">Invoices</h3>
        {isLoading ? (
          <div className="flex items-center gap-2 py-2 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</div>
        ) : invoices.length === 0 ? (
          <p className="text-sm text-slate-500">No invoices cover this matter yet.</p>
        ) : (
          <div className="space-y-2">
            {invoices.map((inv) => (
              <button
                key={inv.id}
                onClick={() => navigate(`/admin/invoices/${inv.id}`)}
                className="flex w-full items-center justify-between rounded-lg border border-slate-100 p-3 text-left text-sm hover:border-emerald-200 hover:bg-emerald-50/50 dark:border-slate-800 dark:hover:border-emerald-800"
              >
                <div>
                  <p className="font-medium">{inv.number || 'Draft'}</p>
                  <p className="text-xs text-slate-400">{formatNaira(inv.total_kobo, inv.currency)} · {inv.issue_date}</p>
                </div>
                <div className="flex items-center gap-2">
                  <InvoiceStatusBadge status={inv.status} />
                  <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                </div>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
