'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Search,
  Plus,
  Eye,
  Pencil,
  Archive,
  ArrowUpDown,
  Users,
  Phone,
  Mail,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { navigate } from '@/lib/router';
import { ApiClientError } from '@/lib/api-client';
import { handleApiError, extractErrorMessage } from '@/lib/error-utils';
import { archiveClient, listClients, type BackendClient } from '@/lib/api/clients';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type FilterStatus = 'all' | 'active' | 'archived';
type SortField = 'name' | 'created_at';
type SortOrder = 'asc' | 'desc';

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-NG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function ClientListPage() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [clients, setClients] = useState<BackendClient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [archivingClientId, setArchivingClientId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadClients() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await listClients({ include_inactive: true, page_size: 100 });
        if (!cancelled) {
          setClients(response.items);
        }
      } catch (err) {
        if (!cancelled) {
          setError(extractErrorMessage(err, 'Unable to load clients right now.'));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadClients();

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredClients = useMemo(() => {
    let result = clients;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (client) =>
          client.name.toLowerCase().includes(q) ||
          (client.email && client.email.toLowerCase().includes(q)) ||
          (client.phone && client.phone.includes(q)) ||
          (client.address && client.address.toLowerCase().includes(q))
      );
    }

    if (filter === 'active') {
      result = result.filter((client) => client.is_active);
    } else if (filter === 'archived') {
      result = result.filter((client) => !client.is_active);
    }

    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'name') {
        cmp = a.name.localeCompare(b.name);
      } else {
        cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [clients, filter, search, sortField, sortOrder]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortField(field);
    setSortOrder('asc');
  };

  const handleArchive = async (clientId: string) => {
    const client = clients.find((entry) => entry.id === clientId);
    if (!client || !client.is_active) {
      toast.info('Archived clients cannot be reactivated yet from the backend.');
      return;
    }

    setArchivingClientId(clientId);
    try {
      await archiveClient(clientId);
      setClients((current) =>
        current.map((entry) =>
          entry.id === clientId ? { ...entry, is_active: false } : entry
        )
      );
      toast.success(`"${client.name}" has been archived.`);
    } catch (err) {
      handleApiError(err, 'Unable to archive client.');
    } finally {
      setArchivingClientId(null);
    }
  };

  const filterChips: { label: string; value: FilterStatus; count: number }[] = [
    { label: 'All', value: 'all', count: clients.length },
    { label: 'Active', value: 'active', count: clients.filter((client) => client.is_active).length },
    { label: 'Archived', value: 'archived', count: clients.filter((client) => !client.is_active).length },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="page-title">Clients</h1>
          <p className="page-description">
            Manage your client directory and contact information.
          </p>
        </div>
        <Button
          onClick={() => navigate('/clients/new')}
          className="bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Client
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search clients by name, email, phone, or address..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-9 pl-9"
          />
        </div>
        <div className="flex items-center gap-1.5">
          {filterChips.map((chip) => (
            <button
              key={chip.value}
              onClick={() => setFilter(chip.value)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                filter === chip.value
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              )}
            >
              {chip.label}
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-xs',
                  filter === chip.value
                    ? 'bg-emerald-500 text-white'
                    : 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                )}
              >
                {chip.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
            <div>
              <p className="font-medium text-slate-900 dark:text-slate-100">Loading clients</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Pulling the latest records from the backend.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : error ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Users className="h-12 w-12 text-slate-300" />
            <div>
              <p className="font-medium text-slate-900 dark:text-slate-100">Could not load clients</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">{error}</p>
            </div>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Try Again
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="text-sm text-slate-500 dark:text-slate-400">
            Showing {filteredClients.length} of {clients.length} clients
          </div>

          <div className="hidden overflow-hidden rounded-xl border bg-card shadow-sm md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 dark:bg-slate-900/30">
                  <TableHead className="w-[280px]">
                    <button
                      onClick={() => handleSort('name')}
                      className="inline-flex items-center gap-1 transition-colors hover:text-emerald-600"
                    >
                      Client Name
                      <ArrowUpDown className="h-3.5 w-3.5" />
                    </button>
                  </TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="hidden lg:table-cell">Phone</TableHead>
                  <TableHead className="hidden xl:table-cell">Address</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>
                    <button
                      onClick={() => handleSort('created_at')}
                      className="inline-flex items-center gap-1 transition-colors hover:text-emerald-600"
                    >
                      Created
                      <ArrowUpDown className="h-3.5 w-3.5" />
                    </button>
                  </TableHead>
                  <TableHead className="w-[60px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClients.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-48 text-center">
                      <div className="flex flex-col items-center gap-3 text-slate-400">
                        <Users className="h-12 w-12 stroke-1" />
                        <p className="text-lg font-medium">No clients found</p>
                        <p className="text-sm">
                          {search
                            ? 'Try adjusting your search or filter criteria.'
                            : 'Get started by adding your first client.'}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredClients.map((client) => (
                    <TableRow
                      key={client.id}
                      className="table-row-legal cursor-pointer"
                      onClick={() => navigate(`/clients/${client.id}`)}
                    >
                      <TableCell>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-900 dark:text-slate-100">
                            {client.name}
                          </p>
                          {client.notes && (
                            <p className="truncate text-xs text-slate-500">{client.notes}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="block max-w-[220px] truncate text-sm text-slate-600 dark:text-slate-400">
                          {client.email || '—'}
                        </span>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <span className="text-sm text-slate-600 dark:text-slate-400">
                          {client.phone || '—'}
                        </span>
                      </TableCell>
                      <TableCell className="hidden xl:table-cell">
                        <span className="block max-w-[240px] truncate text-sm text-slate-600 dark:text-slate-400">
                          {client.address || '—'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            'border text-xs',
                            client.is_active ? 'badge-open' : 'badge-archived'
                          )}
                        >
                          {client.is_active ? 'Active' : 'Archived'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-slate-500 dark:text-slate-400">
                          {formatDate(client.created_at)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem
                              onClick={(event) => {
                                event.stopPropagation();
                                navigate(`/clients/${client.id}`);
                              }}
                            >
                              <Eye className="mr-2 h-4 w-4" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={(event) => {
                                event.stopPropagation();
                                navigate(`/clients/${client.id}/edit`);
                              }}
                            >
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit Client
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleArchive(client.id);
                              }}
                              disabled={!client.is_active || archivingClientId === client.id}
                              className="text-amber-600 focus:text-amber-600"
                            >
                              {archivingClientId === client.id ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <Archive className="mr-2 h-4 w-4" />
                              )}
                              Archive
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-3 md:hidden">
            {filteredClients.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-12 text-center">
                  <div className="flex flex-col items-center gap-3 text-slate-400">
                    <Users className="h-12 w-12 stroke-1" />
                    <p className="text-lg font-medium">No clients found</p>
                    <p className="text-sm">Try adjusting your search or add a new client.</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              filteredClients.map((client) => (
                <Card
                  key={client.id}
                  className="card-legal cursor-pointer"
                  onClick={() => navigate(`/clients/${client.id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-slate-900 dark:text-slate-100">
                          {client.name}
                        </p>
                        {client.email && (
                          <div className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
                            <Mail className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{client.email}</span>
                          </div>
                        )}
                        {client.phone && (
                          <div className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-500">
                            <Phone className="h-3.5 w-3.5 shrink-0" />
                            <span>{client.phone}</span>
                          </div>
                        )}
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          'border text-xs',
                          client.is_active ? 'badge-open' : 'badge-archived'
                        )}
                      >
                        {client.is_active ? 'Active' : 'Archived'}
                      </Badge>
                    </div>
                    <div className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                      Added {formatDate(client.created_at)}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default ClientListPage;
