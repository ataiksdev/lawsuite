// ============================================================================
// LegalOps - Documents Page
// Cross-matter document browser.
//
// The backend has no global documents endpoint — documents are always scoped
// to a matter. This page fetches active matters, then loads each matter's
// documents in parallel and presents them as a unified, filterable list.
// Clicking any document navigates to the parent matter's detail page.
// ============================================================================

'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ExternalLink,
  FileText,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { navigate } from '@/lib/router';
import { extractErrorMessage } from '@/lib/error-utils';
import { listMatters } from '@/lib/api/matters';
import { listDocuments, type BackendDocument, type BackendDocumentStatus, type BackendDocumentType } from '@/lib/api/documents';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

// ── Types ─────────────────────────────────────────────────────────────────────

interface EnrichedDocument extends BackendDocument {
  matter_title: string;
  matter_reference_no: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<BackendDocumentStatus, string> = {
  draft:              'Draft',
  pending_signature:  'Pending Signature',
  signed:             'Signed',
  superseded:         'Superseded',
};

const STATUS_BADGE: Record<BackendDocumentStatus, string> = {
  draft:             'border-slate-200 bg-slate-50 text-slate-600',
  pending_signature: 'border-amber-200 bg-amber-50 text-amber-700',
  signed:            'border-emerald-200 bg-emerald-50 text-emerald-700',
  superseded:        'border-slate-200 bg-slate-100 text-slate-400',
};

const TYPE_LABELS: Record<BackendDocumentType, string> = {
  engagement_letter: 'Engagement Letter',
  memo:              'Memo',
  contract:          'Contract',
  filing:            'Filing',
  correspondence:    'Correspondence',
  report:            'Report',
  other:             'Other',
};

function formatDate(str: string) {
  return new Date(str).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// ── Document row ──────────────────────────────────────────────────────────────

function DocumentRow({ doc }: { doc: EnrichedDocument }) {
  return (
    <div
      className="flex items-center gap-3 rounded-lg border border-slate-100 dark:border-slate-800 px-4 py-3 hover:border-slate-200 dark:hover:border-slate-700 hover:bg-slate-50/50 dark:hover:bg-slate-900/50 transition-colors cursor-pointer"
      onClick={() => navigate(`/matters/${doc.matter_id}`)}
    >
      {/* Icon */}
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/30">
        <FileText className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
      </div>

      {/* Name + matter */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
          {doc.name}
        </p>
        <p className="text-xs text-slate-400 truncate mt-0.5">
          <span className="font-mono">{doc.matter_reference_no}</span>
          {' · '}
          {doc.matter_title}
        </p>
      </div>

      {/* Type */}
      <span className="hidden sm:block text-xs text-slate-400 shrink-0 w-32 truncate">
        {TYPE_LABELS[doc.doc_type] ?? doc.doc_type}
      </span>

      {/* Version */}
      <span className="hidden md:block text-xs text-slate-400 shrink-0 w-12 text-center">
        v{doc.current_version}
      </span>

      {/* Status */}
      <Badge className={cn('border text-xs font-medium shrink-0', STATUS_BADGE[doc.status])}>
        {STATUS_LABELS[doc.status]}
      </Badge>

      {/* Date */}
      <span className="hidden lg:block text-xs text-slate-400 shrink-0 w-24 text-right">
        {formatDate(doc.added_at)}
      </span>

      {/* Drive link */}
      {doc.drive_url && (
        <a
          href={doc.drive_url}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 rounded p-1 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
          title="Open in Google Drive"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function DocumentsPage() {
  const [docs, setDocs] = useState<EnrichedDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<BackendDocumentStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<BackendDocumentType | 'all'>('all');

  const load = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    else setIsRefreshing(true);
    setError(null);

    try {
      // Fetch all non-archived matters (up to 100 — the realistic org max)
      const mattersRes = await listMatters({ page_size: 100 });
      const matters = mattersRes.items ?? [];

      if (matters.length === 0) {
        setDocs([]);
        return;
      }

      // Fetch each matter's documents in parallel; ignore individual failures
      const results = await Promise.allSettled(
        matters.map((m) => listDocuments(m.id).then((d) => ({ matter: m, documents: d })))
      );

      const enriched: EnrichedDocument[] = [];
      for (const result of results) {
        if (result.status === 'fulfilled') {
          const { matter, documents } = result.value;
          for (const doc of documents) {
            enriched.push({
              ...doc,
              matter_title: matter.title,
              matter_reference_no: matter.reference_no,
            });
          }
        }
      }

      // Sort newest first
      enriched.sort((a, b) => new Date(b.added_at).getTime() - new Date(a.added_at).getTime());
      setDocs(enriched);
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not load documents.'));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Filtered list
  const filtered = useMemo(() => {
    return docs.filter((doc) => {
      if (statusFilter !== 'all' && doc.status !== statusFilter) return false;
      if (typeFilter !== 'all' && doc.doc_type !== typeFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          doc.name.toLowerCase().includes(q) ||
          doc.matter_title.toLowerCase().includes(q) ||
          doc.matter_reference_no.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [docs, search, statusFilter, typeFilter]);

  const hasFilters = search || statusFilter !== 'all' || typeFilter !== 'all';
  const clearFilters = () => { setSearch(''); setStatusFilter('all'); setTypeFilter('all'); };

  // Stats
  const draftCount  = docs.filter((d) => d.status === 'draft').length;
  const pendingCount = docs.filter((d) => d.status === 'pending_signature').length;
  const signedCount = docs.filter((d) => d.status === 'signed').length;

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Documents
          </h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            All documents across your active matters.{' '}
            {!isLoading && (
              <span>
                Click any row to open the matter, or the{' '}
                <ExternalLink className="inline h-3 w-3" /> icon to open in Drive.
              </span>
            )}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void load(true)}
          disabled={isRefreshing}
        >
          <RefreshCw className={cn('h-4 w-4 mr-2', isRefreshing && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      {!isLoading && docs.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {[
            { label: `${docs.length} total`, active: false },
            { label: `${draftCount} draft`,   active: statusFilter === 'draft',   onClick: () => setStatusFilter(statusFilter === 'draft' ? 'all' : 'draft') },
            { label: `${pendingCount} pending signature`, active: statusFilter === 'pending_signature', onClick: () => setStatusFilter(statusFilter === 'pending_signature' ? 'all' : 'pending_signature') },
            { label: `${signedCount} signed`, active: statusFilter === 'signed',  onClick: () => setStatusFilter(statusFilter === 'signed' ? 'all' : 'signed') },
          ].map(({ label, active, onClick }) => (
            <button
              key={label}
              onClick={onClick}
              disabled={!onClick}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                active
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
                  : onClick
                    ? 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400'
                    : 'border-slate-100 text-slate-400 cursor-default dark:border-slate-800'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search by name, matter title or reference…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as BackendDocumentStatus | 'all')}>
          <SelectTrigger className="w-44">
            <Filter className="h-3.5 w-3.5 mr-2 text-slate-400" />
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {(Object.entries(STATUS_LABELS) as [BackendDocumentStatus, string][]).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as BackendDocumentType | 'all')}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {(Object.entries(TYPE_LABELS) as [BackendDocumentType, string][]).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="h-4 w-4 mr-1" /> Clear
          </Button>
        )}
      </div>

      {/* Content */}
      <Card className="border-slate-200/80 dark:border-slate-700/80">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <p className="text-sm text-slate-500">{error}</p>
              <Button variant="outline" size="sm" onClick={() => void load()}>Try again</Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <FileText className="h-10 w-10 text-slate-200 dark:text-slate-700" />
              {hasFilters ? (
                <>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                    No documents match your filters.
                  </p>
                  <Button variant="ghost" size="sm" onClick={clearFilters}>Clear filters</Button>
                </>
              ) : docs.length === 0 ? (
                <>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                    No documents yet
                  </p>
                  <p className="text-xs text-slate-400 max-w-xs">
                    Documents are added from within individual matters. Open a matter and link a
                    Google Drive file to get started.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => navigate('/matters')}
                  >
                    Go to Matters
                  </Button>
                </>
              ) : null}
            </div>
          ) : (
            <div className="divide-y divide-slate-50 dark:divide-slate-800/50 px-2 py-2">
              {/* Table header */}
              <div className="flex items-center gap-3 px-4 pb-2 pt-1">
                <div className="w-9 shrink-0" />
                <p className="flex-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Document</p>
                <p className="hidden sm:block text-xs font-semibold uppercase tracking-wide text-slate-400 w-32">Type</p>
                <p className="hidden md:block text-xs font-semibold uppercase tracking-wide text-slate-400 w-12 text-center">Ver.</p>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 w-28">Status</p>
                <p className="hidden lg:block text-xs font-semibold uppercase tracking-wide text-slate-400 w-24 text-right">Added</p>
                <div className="w-6 shrink-0" />
              </div>
              {filtered.map((doc) => (
                <DocumentRow key={doc.id} doc={doc} />
              ))}
            </div>
          )}
        </CardContent>

        {!isLoading && filtered.length > 0 && (
          <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-2.5">
            <p className="text-xs text-slate-400">
              {filtered.length === docs.length
                ? `${docs.length} document${docs.length !== 1 ? 's' : ''} across ${new Set(docs.map((d) => d.matter_id)).size} matters`
                : `Showing ${filtered.length} of ${docs.length} documents`}
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}

export default DocumentsPage;
