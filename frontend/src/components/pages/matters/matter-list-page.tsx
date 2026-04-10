'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Search,
  Plus,
  Eye,
  Pencil,
  ArrowUpDown,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { navigate } from '@/lib/router';
import { ApiClientError } from '@/lib/api-client';
import {
  listMatters,
  type BackendMatter,
  type BackendMatterStatus,
  type BackendMatterType,
} from '@/lib/api/matters';
import { listClients, type BackendClient } from '@/lib/api/clients';
import { listMembers, type MemberSummary } from '@/lib/api/members';
import { MatterStatus, MatterType } from '@/lib/types';

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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type SortField = 'reference_no' | 'title' | 'status' | 'created_at';
type SortOrder = 'asc' | 'desc';
type StatusFilter = 'all' | BackendMatterStatus;
type TypeFilter = 'all' | BackendMatterType;

const PAGE_SIZE = 10;

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-NG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function statusBadgeClass(status: BackendMatterStatus): string {
  const map: Record<BackendMatterStatus, string> = {
    intake: 'badge-intake',
    open: 'badge-open',
    pending: 'badge-pending',
    in_review: 'badge-in_review',
    closed: 'badge-closed',
    archived: 'badge-archived',
  };
  return map[status];
}

function statusLabel(status: BackendMatterStatus): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function matterTypeBadgeClass(type: BackendMatterType): string {
  const map: Record<BackendMatterType, string> = {
    advisory:
      'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/30 dark:text-teal-300 dark:border-teal-800',
    litigation:
      'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800',
    compliance:
      'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/30 dark:text-purple-300 dark:border-purple-800',
    drafting:
      'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800',
    transactional:
      'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800',
  };
  return map[type];
}

function matterTypeLabel(type: BackendMatterType): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All Statuses' },
  { value: MatterStatus.INTAKE, label: 'Intake' },
  { value: MatterStatus.OPEN, label: 'Open' },
  { value: MatterStatus.PENDING, label: 'Pending' },
  { value: MatterStatus.IN_REVIEW, label: 'In Review' },
  { value: MatterStatus.CLOSED, label: 'Closed' },
  { value: MatterStatus.ARCHIVED, label: 'Archived' },
];

const TYPE_FILTER_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'All Types' },
  { value: MatterType.ADVISORY, label: 'Advisory' },
  { value: MatterType.LITIGATION, label: 'Litigation' },
  { value: MatterType.COMPLIANCE, label: 'Compliance' },
  { value: MatterType.DRAFTING, label: 'Drafting' },
  { value: MatterType.TRANSACTIONAL, label: 'Transactional' },
];

export function MatterListPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [clientFilter, setClientFilter] = useState('all');
  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [page, setPage] = useState(1);
  const [matters, setMatters] = useState<BackendMatter[]>([]);
  const [clients, setClients] = useState<BackendClient[]>([]);
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadMatterDependencies() {
      setIsLoading(true);
      setError(null);

      try {
        const [matterResponse, clientResponse, memberResponse] = await Promise.all([
          listMatters({ page_size: 100 }),
          listClients({ include_inactive: false, page_size: 100 }),
          listMembers(),
        ]);

        if (!cancelled) {
          setMatters(matterResponse.items);
          setClients(clientResponse.items.filter((client) => client.is_active));
          setMembers(memberResponse.filter((member) => member.is_active));
        }
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof ApiClientError
              ? err.detail
              : 'Unable to load matters right now.';
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadMatterDependencies();

    return () => {
      cancelled = true;
    };
  }, []);

  const memberNameById = useMemo(
    () =>
      new Map(
        members.map((member) => [
          member.id,
          member.full_name || `${member.first_name} ${member.last_name}`.trim(),
        ])
      ),
    [members]
  );

  const filteredMatters = useMemo(() => {
    let result = [...matters];

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (matter) =>
          matter.title.toLowerCase().includes(q) ||
          matter.reference_no.toLowerCase().includes(q)
      );
    }

    if (statusFilter !== 'all') {
      result = result.filter((matter) => matter.status === statusFilter);
    }

    if (typeFilter !== 'all') {
      result = result.filter((matter) => matter.matter_type === typeFilter);
    }

    if (clientFilter !== 'all') {
      result = result.filter((matter) => matter.client_id === clientFilter);
    }

    if (assigneeFilter !== 'all') {
      result = result.filter((matter) => matter.assigned_to === assigneeFilter);
    }

    result.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'reference_no') {
        cmp = a.reference_no.localeCompare(b.reference_no);
      } else if (sortField === 'title') {
        cmp = a.title.localeCompare(b.title);
      } else if (sortField === 'status') {
        cmp = a.status.localeCompare(b.status);
      } else {
        cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [assigneeFilter, clientFilter, matters, search, sortField, sortOrder, statusFilter, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredMatters.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedMatters = filteredMatters.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, typeFilter, clientFilter, assigneeFilter]);

  const hasActiveFilters =
    statusFilter !== 'all' ||
    typeFilter !== 'all' ||
    clientFilter !== 'all' ||
    assigneeFilter !== 'all' ||
    search.trim() !== '';

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortField(field);
    setSortOrder('asc');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="page-title">Matters</h1>
          <p className="page-description">
            Manage all legal matters, cases, and engagements.
          </p>
        </div>
        <Button
          onClick={() => navigate('/matters/new')}
          className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
        >
          <Plus className="mr-2 h-4 w-4" />
          New Matter
        </Button>
      </div>

      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search by title or reference..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-9 pl-9"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
              <SelectTrigger className="h-9 w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as TypeFilter)}>
              <SelectTrigger className="h-9 w-[155px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_FILTER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={clientFilter} onValueChange={setClientFilter}>
              <SelectTrigger className="hidden h-9 w-[180px] md:block">
                <SelectValue placeholder="All Clients" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Clients</SelectItem>
                {clients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
              <SelectTrigger className="hidden h-9 w-[170px] lg:block">
                <SelectValue placeholder="All Assignees" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Assignees</SelectItem>
                {members.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 text-slate-500"
                onClick={() => {
                  setSearch('');
                  setStatusFilter('all');
                  setTypeFilter('all');
                  setClientFilter('all');
                  setAssigneeFilter('all');
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </div>

        {!isLoading && !error && (
          <div className="text-sm text-slate-500 dark:text-slate-400">
            Showing {pagedMatters.length} of {filteredMatters.length} matters
          </div>
        )}
      </div>

      {isLoading ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
            <div>
              <p className="font-medium text-slate-900 dark:text-slate-100">Loading matters</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Pulling matters, clients, and assignees from the backend.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : error ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Briefcase className="h-12 w-12 stroke-1 text-slate-300" />
            <div>
              <p className="font-medium text-slate-900 dark:text-slate-100">Could not load matters</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">{error}</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border bg-card shadow-sm md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 dark:bg-slate-900/30">
                  <TableHead className="w-[140px]">
                    <button
                      onClick={() => handleSort('reference_no')}
                      className="inline-flex items-center gap-1 transition-colors hover:text-emerald-600"
                    >
                      Reference
                      <ArrowUpDown className="h-3.5 w-3.5" />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button
                      onClick={() => handleSort('title')}
                      className="inline-flex items-center gap-1 transition-colors hover:text-emerald-600"
                    >
                      Title
                      <ArrowUpDown className="h-3.5 w-3.5" />
                    </button>
                  </TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>
                    <button
                      onClick={() => handleSort('status')}
                      className="inline-flex items-center gap-1 transition-colors hover:text-emerald-600"
                    >
                      Status
                      <ArrowUpDown className="h-3.5 w-3.5" />
                    </button>
                  </TableHead>
                  <TableHead className="hidden xl:table-cell">Assignee</TableHead>
                  <TableHead className="hidden lg:table-cell">
                    <button
                      onClick={() => handleSort('created_at')}
                      className="inline-flex items-center gap-1 transition-colors hover:text-emerald-600"
                    >
                      Created
                      <ArrowUpDown className="h-3.5 w-3.5" />
                    </button>
                  </TableHead>
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedMatters.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-48 text-center">
                      <div className="flex flex-col items-center gap-3 text-slate-400">
                        <Briefcase className="h-12 w-12 stroke-1" />
                        <p className="text-lg font-medium">No matters found</p>
                        <p className="text-sm">
                          {hasActiveFilters
                            ? 'Try adjusting your search or filter criteria.'
                            : 'Get started by creating your first matter.'}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  pagedMatters.map((matter) => (
                    <TableRow
                      key={matter.id}
                      className="table-row-legal cursor-pointer"
                      onClick={() => navigate(`/matters/${matter.id}`)}
                    >
                      <TableCell>
                        <span className="font-mono text-xs font-medium text-slate-500 dark:text-slate-400">
                          {matter.reference_no}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="block max-w-[280px] truncate font-medium text-slate-900 dark:text-slate-100">
                          {matter.title}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="block max-w-[160px] truncate text-sm text-slate-600 dark:text-slate-400">
                          {matter.client?.name || '—'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn('border text-xs', matterTypeBadgeClass(matter.matter_type))}
                        >
                          {matterTypeLabel(matter.matter_type)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn('border text-xs', statusBadgeClass(matter.status))}
                        >
                          {statusLabel(matter.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden xl:table-cell">
                        <span className="text-sm text-slate-600 dark:text-slate-400">
                          {matter.assigned_to ? memberNameById.get(matter.assigned_to) || 'Assigned' : 'Unassigned'}
                        </span>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <span className="text-sm text-slate-500 dark:text-slate-400">
                          {formatDate(matter.created_at)}
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
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem
                              onClick={(event) => {
                                event.stopPropagation();
                                navigate(`/matters/${matter.id}`);
                              }}
                            >
                              <Eye className="mr-2 h-4 w-4" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={(event) => {
                                event.stopPropagation();
                                navigate(`/matters/${matter.id}/edit`);
                              }}
                            >
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit Matter
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
            {pagedMatters.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-12 text-center">
                  <div className="flex flex-col items-center gap-3 text-slate-400">
                    <Briefcase className="h-12 w-12 stroke-1" />
                    <p className="text-lg font-medium">No matters found</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              pagedMatters.map((matter) => (
                <Card
                  key={matter.id}
                  className="card-legal cursor-pointer"
                  onClick={() => navigate(`/matters/${matter.id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-2">
                          <span className="font-mono text-[10px] font-medium text-slate-400">
                            {matter.reference_no}
                          </span>
                          <Badge
                            variant="outline"
                            className={cn('border text-[10px]', statusBadgeClass(matter.status))}
                          >
                            {statusLabel(matter.status)}
                          </Badge>
                        </div>
                        <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                          {matter.title}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Badge
                            variant="outline"
                            className={cn('border text-[10px]', matterTypeBadgeClass(matter.matter_type))}
                          >
                            {matterTypeLabel(matter.matter_type)}
                          </Badge>
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {matter.client?.name}
                          </span>
                        </div>
                      </div>
                      <span className="whitespace-nowrap text-xs text-slate-400">
                        {formatDate(matter.created_at)}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Page {currentPage} of {totalPages}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={currentPage <= 1}
                  onClick={() => setPage(currentPage - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {Array.from({ length: totalPages }, (_, index) => index + 1)
                  .filter(
                    (pageNumber) =>
                      pageNumber === 1 ||
                      pageNumber === totalPages ||
                      Math.abs(pageNumber - currentPage) <= 1
                  )
                  .map((pageNumber, index, pages) => {
                    const previous = pages[index - 1];
                    const showEllipsis = previous !== undefined && pageNumber - previous > 1;
                    return (
                      <React.Fragment key={pageNumber}>
                        {showEllipsis && (
                          <span className="px-1 text-sm text-slate-400">...</span>
                        )}
                        <Button
                          variant={pageNumber === currentPage ? 'default' : 'outline'}
                          size="icon"
                          className={cn(
                            'h-8 w-8',
                            pageNumber === currentPage &&
                              'bg-emerald-600 text-white hover:bg-emerald-700'
                          )}
                          onClick={() => setPage(pageNumber)}
                        >
                          {pageNumber}
                        </Button>
                      </React.Fragment>
                    );
                  })}
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage(currentPage + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default MatterListPage;
