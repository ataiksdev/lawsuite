'use client';

import React, { useEffect, useState } from 'react';
import { Plus, ShieldAlert, Loader2, ArrowRight } from 'lucide-react';
import { navigate } from '@/lib/router';
import { formatNaira } from '@/lib/utils';
import { useAuthStore } from '@/lib/auth-store';
import { UserRole } from '@/lib/types';
import { handleApiError } from '@/lib/error-utils';
import {
  getDashboardSummary, type InvoiceDashboardSummary, type BackendInvoice,
} from '@/lib/api/invoices';
import { listClients, type BackendClient } from '@/lib/api/clients';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { NewInvoiceDialog } from '../invoices/components/new-invoice-dialog';
import { InvoiceStatusBadge, STATUS_LABELS } from '../invoices/components/invoice-status-badge';

const STATUS_ORDER: (keyof typeof STATUS_LABELS)[] = [
  'draft', 'sent', 'part_paid', 'overdue', 'paid', 'void', 'written_off',
];

function SummaryCard({ label, amountKobo, tone }: { label: string; amountKobo: number; tone?: 'amber' | 'red' }) {
  return (
    <Card className="shadow-sm">
      <CardContent className="p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
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

export function FinanceDashboardPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === UserRole.ADMIN;

  const [summary, setSummary] = useState<InvoiceDashboardSummary | null>(null);
  const [clients, setClients] = useState<BackendClient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showNewInvoiceDialog, setShowNewInvoiceDialog] = useState(false);

  const load = React.useCallback(async () => {
    if (!isAdmin) { setIsLoading(false); return; }
    setIsLoading(true);
    try {
      const [summaryRes, clientsRes] = await Promise.all([
        getDashboardSummary(),
        listClients({ include_inactive: true, page_size: 100 }),
      ]);
      setSummary(summaryRes);
      setClients(clientsRes.items);
    } catch (err) {
      handleApiError(err, 'Unable to load the financial dashboard right now.');
    } finally {
      setIsLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => { void load(); }, [load]);

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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard label="Outstanding" amountKobo={summary.outstanding_kobo} tone="amber" />
            <SummaryCard label="Overdue" amountKobo={summary.overdue_kobo} tone="red" />
            <SummaryCard label="Expected (Draft)" amountKobo={summary.expected_kobo} />
            <SummaryCard label="Paid This Month" amountKobo={summary.paid_this_month_kobo} />
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
