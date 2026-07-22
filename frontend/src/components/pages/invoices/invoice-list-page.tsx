'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Receipt, ShieldAlert, Loader2 } from 'lucide-react';
import { navigate } from '@/lib/router';
import { formatNaira } from '@/lib/utils';
import { useAuthStore } from '@/lib/auth-store';
import { UserRole } from '@/lib/types';
import { handleApiError } from '@/lib/error-utils';
import { listInvoices, type BackendInvoice, type InvoiceStatus } from '@/lib/api/invoices';
import { listMatters, type BackendMatter } from '@/lib/api/matters';
import { listClients, type BackendClient } from '@/lib/api/clients';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { NewInvoiceDialog } from './components/new-invoice-dialog';
import { InvoiceStatusBadge } from './components/invoice-status-badge';

type StatusFilter = 'all' | InvoiceStatus;

export function InvoiceListPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === UserRole.ADMIN;

  const [invoices, setInvoices] = useState<BackendInvoice[]>([]);
  const [matters, setMatters] = useState<BackendMatter[]>([]);
  const [clients, setClients] = useState<BackendClient[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [showNewInvoiceDialog, setShowNewInvoiceDialog] = useState(false);

  useEffect(() => {
    if (!isAdmin) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      try {
        const [invoicesRes, mattersRes, clientsRes] = await Promise.all([
          listInvoices({ page_size: 100 }),
          listMatters({ page_size: 100 }),
          listClients({ include_inactive: true, page_size: 100 }),
        ]);
        if (!cancelled) {
          setInvoices(invoicesRes.items);
          setMatters(mattersRes.items);
          setClients(clientsRes.items);
        }
      } catch (err) {
        if (!cancelled) handleApiError(err, 'Unable to load invoices right now.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [isAdmin]);

  const matterTitleById = useMemo(() => {
    const map = new Map<string, string>();
    matters.forEach((m) => map.set(m.id, m.title));
    return map;
  }, [matters]);

  const clientNameById = useMemo(() => {
    const map = new Map<string, string>();
    clients.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [clients]);

  const filteredInvoices = useMemo(() => {
    if (statusFilter === 'all') return invoices;
    return invoices.filter((inv) => inv.status === statusFilter);
  }, [invoices, statusFilter]);

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="page-title">Invoices</h1>
          <p className="page-description">Manage client invoicing, fee arrangements, and payments.</p>
        </div>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <ShieldAlert className="h-8 w-8 text-slate-400" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Admin access required</p>
            <p className="max-w-sm text-sm text-slate-500">
              Invoicing is restricted to organisation admins. Contact an admin if you need access.
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
          <h1 className="page-title">Invoices</h1>
          <p className="page-description">Manage client invoicing, fee arrangements, and payments.</p>
        </div>
        <Button
          onClick={() => setShowNewInvoiceDialog(true)}
          className="bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
        >
          <Plus className="mr-2 h-4 w-4" />
          New Invoice
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="part_paid">Part Paid</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="void">Void</SelectItem>
            <SelectItem value="written_off">Written Off</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <Card className="border-dashed">
          <CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading invoices...
          </CardContent>
        </Card>
      ) : filteredInvoices.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Receipt className="h-8 w-8 text-slate-300" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No invoices yet</p>
            <p className="max-w-sm text-sm text-slate-500">
              Create your first invoice to start billing clients for matter fees and disbursements.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-slate-200/80 dark:border-slate-700/80">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-100 dark:border-slate-800">
                    <TableHead>Number</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Matters</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Issue Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvoices.map((invoice) => (
                    <TableRow
                      key={invoice.id}
                      className="cursor-pointer border-slate-50 dark:border-slate-800/50"
                      onClick={() => navigate(`/admin/invoices/${invoice.id}`)}
                    >
                      <TableCell className="font-medium">
                        {invoice.number || <span className="text-slate-400">Draft</span>}
                      </TableCell>
                      <TableCell>{clientNameById.get(invoice.client_id) || '—'}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {invoice.matter_ids.length === 0 ? (
                            <span className="text-xs text-slate-400">—</span>
                          ) : (
                            invoice.matter_ids.map((id) => (
                              <Badge key={id} variant="outline" className="text-[10px]">
                                {matterTitleById.get(id) || id.slice(0, 8)}
                              </Badge>
                            ))
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNaira(invoice.total_kobo, invoice.currency)}
                      </TableCell>
                      <TableCell>
                        <InvoiceStatusBadge status={invoice.status} />
                      </TableCell>
                      <TableCell className="text-slate-500">{invoice.issue_date}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <NewInvoiceDialog
        open={showNewInvoiceDialog}
        onOpenChange={setShowNewInvoiceDialog}
        clients={clients}
        onCreated={(invoice) => navigate(`/admin/invoices/${invoice.id}`)}
      />
    </div>
  );
}
