'use client';

import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, ShieldAlert, History } from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';
import { UserRole } from '@/lib/types';
import { handleApiError } from '@/lib/error-utils';
import { listAuditLogs, type BackendAuditLog } from '@/lib/api/audit-logs';
import { listMembers, type MemberSummary } from '@/lib/api/members';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const PAGE_SIZE = 50;

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-NG', {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function actionLabel(action: string): string {
  return action.replace(/\./g, ' ').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function AuditLogPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === UserRole.ADMIN;

  const [entries, setEntries] = useState<BackendAuditLog[]>([]);
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isAdmin) { setIsLoading(false); return; }
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      try {
        const [logsRes, membersRes] = await Promise.all([
          listAuditLogs({ page, page_size: PAGE_SIZE }),
          listMembers(),
        ]);
        if (!cancelled) {
          setEntries(logsRes.items);
          setTotal(logsRes.total);
          setPages(logsRes.pages);
          setMembers(membersRes);
        }
      } catch (err) {
        if (!cancelled) handleApiError(err, 'Unable to load the audit log right now.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [isAdmin, page]);

  const actorNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    members.forEach((m) => map.set(m.id, m.full_name));
    return map;
  }, [members]);

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="page-title">Audit Log</h1>
          <p className="page-description">A record of destructive admin actions across the organisation.</p>
        </div>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <ShieldAlert className="h-8 w-8 text-slate-400" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Admin access required</p>
            <p className="max-w-sm text-sm text-slate-500">
              The audit log is restricted to organisation admins. Contact an admin if you need access.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Audit Log</h1>
        <p className="page-description">A record of destructive admin actions — deleted clients, deleted invoices, and more to come.</p>
      </div>

      {isLoading ? (
        <Card className="border-dashed">
          <CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading audit log...
          </CardContent>
        </Card>
      ) : entries.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <History className="h-8 w-8 text-slate-300" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No audit entries yet</p>
            <p className="max-w-sm text-sm text-slate-500">
              Actions like deleting an empty client or invoice will show up here.
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
                    <TableHead>When</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Summary</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id} className="border-slate-50 dark:border-slate-800/50">
                      <TableCell className="text-slate-500 whitespace-nowrap">{formatDateTime(entry.created_at)}</TableCell>
                      <TableCell>{entry.actor_id ? (actorNameById.get(entry.actor_id) || 'Unknown user') : 'System'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[11px]">{actionLabel(entry.action)}</Badge>
                      </TableCell>
                      <TableCell className="text-slate-500">{entry.entity_type}</TableCell>
                      <TableCell className="text-sm text-slate-700 dark:text-slate-300">{entry.summary}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total} entries
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="font-medium text-slate-700 dark:text-slate-300">{page} / {pages}</span>
            <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
