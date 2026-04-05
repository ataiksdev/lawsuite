'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  Mail,
  Pencil,
  Phone,
  Archive,
  Loader2,
  FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { navigate, useRouteParams } from '@/lib/router';
import { ApiClientError } from '@/lib/api-client';
import { archiveClient, getClient, type BackendClient } from '@/lib/api/clients';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-NG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-NG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function ClientDetailPage() {
  const params = useRouteParams();
  const clientId = params.id;

  const [client, setClient] = useState<BackendClient | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);

  useEffect(() => {
    if (!clientId) {
      setIsLoading(false);
      setError('No client id was provided.');
      return;
    }

    let cancelled = false;

    async function loadClient() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await getClient(clientId);
        if (!cancelled) {
          setClient(response);
        }
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof ApiClientError ? err.detail : 'Unable to load this client.';
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadClient();

    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const stats = useMemo(
    () => [
      {
        label: 'Status',
        value: client?.is_active ? 'Active' : 'Archived',
      },
      {
        label: 'Created',
        value: client ? formatDate(client.created_at) : '—',
      },
      {
        label: 'Updated',
        value: client ? formatDate(client.updated_at) : '—',
      },
    ],
    [client]
  );

  const handleArchive = async () => {
    if (!client || !client.is_active) {
      setShowArchiveDialog(false);
      toast.info('Reactivating archived clients is not available yet.');
      return;
    }

    setIsArchiving(true);
    try {
      await archiveClient(client.id);
      setClient({ ...client, is_active: false });
      setShowArchiveDialog(false);
      toast.success(`"${client.name}" has been archived.`);
    } catch (err) {
      const message =
        err instanceof ApiClientError ? err.detail : 'Unable to archive this client.';
      toast.error(message);
    } finally {
      setIsArchiving(false);
    }
  };

  if (isLoading) {
    return (
      <Card className="shadow-sm">
        <CardContent className="flex items-center gap-3 py-10">
          <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
          <span className="text-sm text-slate-600 dark:text-slate-400">
            Loading client details...
          </span>
        </CardContent>
      </Card>
    );
  }

  if (error || !client) {
    return (
      <Card className="shadow-sm">
        <CardContent className="space-y-4 py-8">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {error || 'Client not found.'}
          </p>
          <Button variant="outline" onClick={() => navigate('/clients')}>
            Back to Clients
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/clients')}
            className="mt-0.5 h-9 w-9 shrink-0 text-slate-500 hover:text-slate-700"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="page-title">{client.name}</h1>
              <Badge
                variant="outline"
                className={cn('border', client.is_active ? 'badge-open' : 'badge-archived')}
              >
                {client.is_active ? 'Active' : 'Archived'}
              </Badge>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
              {client.email && (
                <span className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
                  <Mail className="h-3.5 w-3.5" />
                  <span>{client.email}</span>
                </span>
              )}
              {client.phone && (
                <span className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
                  <Phone className="h-3.5 w-3.5" />
                  <span>{client.phone}</span>
                </span>
              )}
              <span className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
                <Calendar className="h-3.5 w-3.5" />
                <span>Added {formatDate(client.created_at)}</span>
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/clients/${client.id}/edit`)}
            className="h-9"
          >
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowArchiveDialog(true)}
            className={cn(
              'h-9',
              client.is_active
                ? 'text-amber-600 hover:bg-amber-50 hover:text-amber-700 dark:hover:bg-amber-950/20'
                : 'text-slate-400'
            )}
            disabled={!client.is_active}
          >
            <Archive className="mr-1.5 h-3.5 w-3.5" />
            Archive
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.label} className="card-legal">
            <CardContent className="p-4">
              <p className="stat-label">{stat.label}</p>
              <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
                {stat.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="shadow-sm">
          <CardContent className="space-y-4 p-6">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-900 dark:text-slate-100">
              Contact Information
            </h3>
            <DetailRow label="Client Name" value={client.name} />
            <DetailRow label="Email" value={client.email} />
            <DetailRow label="Phone" value={client.phone} />
            <DetailRow label="Address" value={client.address} />
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="space-y-4 p-6">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-900 dark:text-slate-100">
              Notes
            </h3>
            <p className="text-sm leading-6 text-slate-700 dark:text-slate-300">
              {client.notes || 'No notes recorded for this client yet.'}
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm lg:col-span-2">
          <CardContent className="space-y-4 p-6">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-slate-500" />
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-900 dark:text-slate-100">
                Linked Work
              </h3>
            </div>
            <p className="text-sm leading-6 text-slate-600 dark:text-slate-400">
              Matters, activity, and document history for a client are still on the next pass. This
              page is now using the real backend record for the client itself, so the remaining
              linked sections can be wired cleanly on top of that.
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm lg:col-span-2">
          <CardContent className="space-y-4 p-6">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-900 dark:text-slate-100">
              Record Info
            </h3>
            <DetailRow label="Created" value={formatDateTime(client.created_at)} />
            <DetailRow label="Last Updated" value={formatDateTime(client.updated_at)} />
            <DetailRow label="Status" value={client.is_active ? 'Active' : 'Archived'} />
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={showArchiveDialog} onOpenChange={setShowArchiveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Client</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to archive "{client.name}"? The backend currently supports
              archiving, but not reactivating, so this client will move into the archived state.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isArchiving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleArchive}
              disabled={isArchiving}
              className="bg-amber-600 text-white hover:bg-amber-700"
            >
              {isArchiving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Archiving...
                </>
              ) : (
                'Archive'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium text-slate-400 dark:text-slate-500">{label}</span>
      <span className="text-sm text-slate-700 dark:text-slate-300">{value || '—'}</span>
    </div>
  );
}

export default ClientDetailPage;
