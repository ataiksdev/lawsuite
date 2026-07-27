'use client';

import React, { useEffect, useState } from 'react';
import { Plus, ShieldAlert, Loader2, ArrowRight, RotateCw } from 'lucide-react';
import { navigate } from '@/lib/router';
import { cn, formatNaira } from '@/lib/utils';
import { useAuthStore } from '@/lib/auth-store';
import { UserRole } from '@/lib/types';
import { handleApiError } from '@/lib/error-utils';
import {
  getDashboardSummary, type InvoiceDashboardSummary, type BackendInvoice, type SummaryPeriod,
} from '@/lib/api/invoices';
import { listClients, type BackendClient } from '@/lib/api/clients';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { NewInvoiceDialog } from '../invoices/components/new-invoice-dialog';
import { InvoiceStatusBadge, STATUS_LABELS } from '../invoices/components/invoice-status-badge';

const STATUS_ORDER: (keyof typeof STATUS_LABELS)[] = [
  'draft', 'sent', 'part_paid', 'overdue', 'paid', 'void', 'written_off',
];

// Click-to-cycle period, used by the two time-scoped summary cards (Paid,
// Professional Fee Income). Each card owns its own period independently.
const PERIOD_ORDER: SummaryPeriod[] = ['month', 'quarter', 'year'];
const PERIOD_LABELS: Record<SummaryPeriod, string> = { month: 'Month', quarter: 'Quarter', year: 'Year' };
function nextPeriod(period: SummaryPeriod): SummaryPeriod {
  return PERIOD_ORDER[(PERIOD_ORDER.indexOf(period) + 1) % PERIOD_ORDER.length];
}

function PeriodBadge({ period }: { period: SummaryPeriod }) {
  return (
    <span className="flex shrink-0 items-center gap-1 text-[10px] font-medium text-slate-400">
      <RotateCw className="h-3 w-3" />
      {PERIOD_LABELS[period]}
    </span>
  );
}

function SummaryCard({
  label,
  amountKobo,
  tone,
  period,
  onClick,
}: {
  label: string;
  amountKobo: number;
  tone?: 'amber' | 'red';
  period?: SummaryPeriod;
  onClick?: () => void;
}) {
  return (
    <Card
      className={cn('border-2 shadow-sm', onClick && 'cursor-pointer transition-colors hover:border-primary/40')}
      onClick={onClick}
    >
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
          {period && <PeriodBadge period={period} />}
        </div>
        <p
          className={
            tone === 'red'
              ? 'mt-1 text-2xl font-semibold tabular-nums text-red-600 dark:text-red-400'
              : tone === 'amber'
              ? 'mt-1 text-2xl font-semibold tabular-nums text-amber-600 dark:text-amber-400'
              : 'mt-1 text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100'
          }
        >
          {formatNaira(amountKobo)}
        </p>
      </CardContent>
    </Card>
  );
}

// Professional-fee-only income for the selected period. "Expected" is what's
// been billed in professional_fee line items in that period; "received" is
// the portion of that already collected (a payment against a mixed invoice
// is prorated by its professional-fee share — see backend InvoiceService).
function ProfessionalFeeIncomeCard({
  receivedKobo,
  expectedKobo,
  period,
  onClick,
}: {
  receivedKobo: number;
  expectedKobo: number;
  period: SummaryPeriod;
  onClick: () => void;
}) {
  const received = receivedKobo ?? 0;
  const expected = expectedKobo ?? 0;
  const pct = expected > 0 ? Math.min(100, Math.round((received / expected) * 100)) : 0;

  return (
    <Card className="border-2 shadow-sm cursor-pointer transition-colors hover:border-primary/40" onClick={onClick}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Professional Fee Income</p>
          <PeriodBadge period={period} />
        </div>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
          {formatNaira(received)}
        </p>
        <p className="mt-0.5 text-xs text-slate-400">of {formatNaira(expected)} expected</p>
        <Progress value={pct} className="mt-2 h-1.5" />
      </CardContent>
    </Card>
  );
}

export function FinanceDashboardPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === UserRole.ADMIN;

  const [summary, setSummary] = useState<InvoiceDashboardSummary | null>(null);
  const [clients, setClients] = useState<BackendClient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showNewInvoiceDialog, setShowNewInvoiceDialog] = useState(false);
  const [paidPeriod, setPaidPeriod] = useState<SummaryPeriod>('month');
  const [feesPeriod, setFeesPeriod] = useState<SummaryPeriod>('month');

  const loadSummary = React.useCallback(async () => {
    if (!isAdmin) { setIsLoading(false); return; }
    setIsLoading(true);
    try {
      const summaryRes = await getDashboardSummary({ paid_period: paidPeriod, fees_period: feesPeriod });
      setSummary(summaryRes);
    } catch (err) {
      handleApiError(err, 'Unable to load the financial dashboard right now.');
    } finally {
      setIsLoading(false);
    }
  }, [isAdmin, paidPeriod, feesPeriod]);

  useEffect(() => { void loadSummary(); }, [loadSummary]);

  useEffect(() => {
    if (!isAdmin) return;
    listClients({ include_inactive: true, page_size: 100 })
      .then((res) => setClients(res.items))
      .catch((err) => handleApiError(err, 'Unable to load clients right now.'));
  }, [isAdmin]);

  const clientNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    clients.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [clients]);

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="page-title">Finance</h1>
          <p className="page-description">Invoicing, revenue, and outstanding balances.</p>
        </div>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <ShieldAlert className="h-8 w-8 text-slate-400" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Admin access required</p>
            <p className="max-w-sm text-sm text-slate-500">
              Financial data is restricted to organisation admins. Contact an admin if you need access.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="page-title">Finance</h1>
          <p className="page-description">Invoicing, revenue, and outstanding balances.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate('/admin/invoices')}>
            View All Invoices <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <Button onClick={() => setShowNewInvoiceDialog(true)} className="bg-emerald-600 text-white shadow-sm hover:bg-emerald-700">
            <Plus className="mr-2 h-4 w-4" />
            New Invoice
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Card className="border-dashed">
          <CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading dashboard...
          </CardContent>
        </Card>
      ) : !summary ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center text-sm text-slate-500">Unable to load dashboard data.</CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <SummaryCard label="Outstanding" amountKobo={summary.outstanding_kobo} tone="amber" />
            <SummaryCard label="Overdue" amountKobo={summary.overdue_kobo} tone="red" />
            <SummaryCard label="Expected (Draft)" amountKobo={summary.expected_kobo} />
            <SummaryCard
              label="Paid"
              amountKobo={summary.paid_period_kobo}
              period={paidPeriod}
              onClick={() => setPaidPeriod((p) => nextPeriod(p))}
            />
            <ProfessionalFeeIncomeCard
              receivedKobo={summary.professional_fees_received_kobo}
              expectedKobo={summary.professional_fees_expected_kobo}
              period={feesPeriod}
              onClick={() => setFeesPeriod((p) => nextPeriod(p))}
            />
          </div>

          <Card className="shadow-sm">
            <CardContent className="p-6">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-900 dark:text-slate-100">
                Invoices by Status
              </h3>
              <div className="flex flex-wrap gap-4">
                {STATUS_ORDER.map((status) => (
                  <div key={status} className="flex items-center gap-2 text-sm">
                    <InvoiceStatusBadge status={status} />
                    <span className="font-semibold tabular-nums text-slate-700 dark:text-slate-300">
                      {summary.status_counts[status] || 0}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="p-6">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-900 dark:text-slate-100">
                Needs Attention
              </h3>
              {summary.attention_items.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">
                  Nothing outstanding — every sent invoice is fully paid.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Number</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead className="text-right">Balance Due</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summary.attention_items.map((item) => (
                        <TableRow
                          key={item.id}
                          className="cursor-pointer"
                          onClick={() => navigate(`/admin/invoices/${item.id}`)}
                        >
                          <TableCell className="font-medium">
                            {item.number || <span className="text-slate-400">Draft</span>}
                          </TableCell>
                          <TableCell>{clientNameById.get(item.client_id) || '—'}</TableCell>
                          <TableCell><InvoiceStatusBadge status={item.status} /></TableCell>
                          <TableCell className="text-slate-500">{item.due_date || '—'}</TableCell>
                          <TableCell className="text-right tabular-nums text-amber-600 dark:text-amber-400">
                            {formatNaira(item.balance_due_kobo, item.currency)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <NewInvoiceDialog
        open={showNewInvoiceDialog}
        onOpenChange={setShowNewInvoiceDialog}
        clients={clients}
        onCreated={(invoice: BackendInvoice) => navigate(`/admin/invoices/${invoice.id}`)}
      />
    </div>
  );
}
