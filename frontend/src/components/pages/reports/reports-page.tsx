// ============================================================================
// Lawmate - Reports Page
// Wired to real backend: POST /reports/generate + GET /reports/history
// Feature-gated: requires reports feature (Pro/Agency/trial)
// ============================================================================

'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  Calendar,
  Check,
  ChevronsUpDown,
  Clock,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Play,
  RefreshCw,
  Lock,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ApiClientError } from '@/lib/api-client';
import { useSubscription } from '@/hooks/use-subscription';
import { navigate } from '@/lib/router';
import {
  generateReport,
  listReports,
  downloadReportHtml,
  type ReportGeneratePayload,
  type ReportRecord,
  type ReportPeriodType,
} from '@/lib/api/reports';
import { listClients, type BackendClient } from '@/lib/api/clients';
import { listMatters, type BackendMatter } from '@/lib/api/matters';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

// ============================================================================
// Searchable select (combobox)
// ============================================================================

interface ComboOption {
  value: string;
  label: string;
}

function SearchableSelect({
  value,
  onChange,
  options,
  onSearch,
  placeholder,
  emptyLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: ComboOption[];
  onSearch?: (query: string) => Promise<ComboOption[]>;
  placeholder: string;
  emptyLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ComboOption[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!onSearch) return;
    if (!query) {
      setSearchResults(null);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      onSearch(query)
        .then((results) => {
          if (!cancelled) setSearchResults(results);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, onSearch]);

  const displayedOptions = onSearch ? (searchResults ?? options) : options;
  const selected = options.find((o) => o.value === value) ?? searchResults?.find((o) => o.value === value);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery('');
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className="flex h-9 w-full items-center justify-between rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-sm transition-colors dark:border-slate-800"
        >
          <span className={cn('truncate text-left', !selected && 'text-slate-500 dark:text-slate-400')}>
            {selected ? selected.label : emptyLabel}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={!onSearch}>
          <CommandInput placeholder={placeholder} value={query} onValueChange={setQuery} className="h-9" />
          <CommandList>
            <CommandEmpty>{searching ? 'Searching…' : 'No results found.'}</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value={emptyLabel}
                onSelect={() => {
                  onChange('');
                  setOpen(false);
                }}
              >
                <Check className={cn('h-4 w-4', value === '' ? 'opacity-100' : 'opacity-0')} />
                {emptyLabel}
              </CommandItem>
              {displayedOptions.map((opt) => (
                <CommandItem
                  key={opt.value}
                  value={onSearch ? opt.value : opt.label}
                  onSelect={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                >
                  <Check className={cn('h-4 w-4', value === opt.value ? 'opacity-100' : 'opacity-0')} />
                  {opt.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ============================================================================
// Feature gate
// ============================================================================

function ReportsGate() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800">
        <Lock className="h-8 w-8 text-slate-400" />
      </div>
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Reports require Pro or Agency</h2>
      <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">
        Upgrade your plan to generate activity reports, export to Google Docs, and receive scheduled email digests.
      </p>
      <Button className="mt-6 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => navigate('/admin/billing')}>
        View Plans
      </Button>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function formatDate(str: string) {
  return new Date(str).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

function PeriodBadge({ period }: { period: string }) {
  const isWeekly = period.startsWith('Week');
  const isMonthly = /^\w+ \d{4}$/.test(period);
  return (
    <Badge
      className={cn(
        'border text-xs font-medium',
        isWeekly ? 'border-blue-200 bg-blue-50 text-blue-700' :
        isMonthly ? 'border-emerald-200 bg-emerald-50 text-emerald-700' :
        'border-slate-200 bg-slate-50 text-slate-600'
      )}
    >
      {period}
    </Badge>
  );
}

// ============================================================================
// Generate Form
// ============================================================================

function GenerateForm({
  onGenerated,
  hasDrive,
}: {
  onGenerated: (record: ReportRecord) => void;
  hasDrive: boolean;
}) {
  const [periodType, setPeriodType] = useState<ReportPeriodType>('monthly');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [exportToDrive, setExportToDrive] = useState(hasDrive);
  const [sendEmail, setSendEmail] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  
  const [clients, setClients] = useState<BackendClient[]>([]);
  const [matters, setMatters] = useState<BackendMatter[]>([]);
  const [selectedClient, setSelectedClient] = useState<string>('');
  const [selectedMatter, setSelectedMatter] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');

  useEffect(() => {
    async function loadFilters() {
      try {
        const [cRes, mRes] = await Promise.all([
          listClients({ page_size: 100 }),
          listMatters({ page_size: 100 })
        ]);
        setClients(cRes.items);
        setMatters(mRes.items);
      } catch (e) {}
    }
    loadFilters();
  }, []);

  const filteredMatters = selectedClient
    ? matters.filter(m => m.client_id === selectedClient)
    : matters;

  const clientOptions: ComboOption[] = clients.map((c) => ({ value: c.id, label: c.name }));
  const matterOptions: ComboOption[] = filteredMatters.map((m) => ({
    value: m.id,
    label: `${m.reference_no} - ${m.title}`,
  }));
  const categoryOptions: ComboOption[] = [
    'advisory', 'litigation', 'compliance', 'drafting', 'transactional', 'corporate',
    'property', 'intellectual_property', 'labour', 'adr', 'probate', 'entertainment', 'sports', 'audit',
  ].map((cat) => ({ value: cat, label: cat.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase()) }));

  const searchClients = useCallback(async (query: string) => {
    const res = await listClients({ search: query, page_size: 50 });
    return res.items.map((c) => ({ value: c.id, label: c.name }));
  }, []);

  const searchMatters = useCallback(async (query: string) => {
    const res = await listMatters({
      search: query,
      page_size: 50,
      ...(selectedClient && { client_id: selectedClient }),
    });
    return res.items.map((m) => ({ value: m.id, label: `${m.reference_no} - ${m.title}` }));
  }, [selectedClient]);

  const handleGenerate = async () => {
    if (periodType === 'custom' && (!dateFrom || !dateTo)) {
      toast.error('Please select both start and end dates for a custom period.');
      return;
    }
    setIsGenerating(true);
    try {
      const payload: ReportGeneratePayload = {
        period_type: periodType,
        export_to_drive: exportToDrive && hasDrive,
        send_email: sendEmail,
        ...(periodType === 'custom' && { date_from: dateFrom, date_to: dateTo }),
        ...(sendEmail && recipientEmail && { recipient_email: recipientEmail }),
        ...(selectedClient && { client_id: selectedClient }),
        ...(selectedMatter && { matter_id: selectedMatter }),
        ...(selectedCategory && { matter_type: selectedCategory }),
      };
      const result = await generateReport(payload);
      toast.success('Report generated!', {
        description: result.report.drive_url
          ? 'Your report is ready in Google Docs.'
          : `Report for ${result.report.period_label} created.`,
      });
      onGenerated(result.report);
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.detail : 'Could not generate report.';
      toast.error(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Card className="border-slate-200/80 dark:border-slate-700/80">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Play className="h-4 w-4 text-emerald-600" />
          <CardTitle className="text-base font-semibold">Generate Report</CardTitle>
        </div>
        <CardDescription className="text-xs">
          Aggregate activity across all matters and export to Google Docs.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Period type */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Period</Label>
          <div className="flex gap-2">
            {(['weekly', 'monthly', 'custom'] as ReportPeriodType[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriodType(p)}
                className={cn(
                  'flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                  periodType === p
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400'
                )}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
          {periodType === 'weekly' && (
            <p className="text-xs text-slate-400">Last 7 complete days</p>
          )}
          {periodType === 'monthly' && (
            <p className="text-xs text-slate-400">Previous calendar month</p>
          )}
        </div>

        {/* Custom date range */}
        {periodType === 'custom' && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="date-from" className="text-xs">From</Label>
              <Input
                id="date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="date-to" className="text-xs">To</Label>
              <Input
                id="date-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Filters (Optional)</Label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SearchableSelect
              value={selectedClient}
              onChange={(v) => {
                setSelectedClient(v);
                setSelectedMatter('');
              }}
              options={clientOptions}
              onSearch={searchClients}
              placeholder="Search clients..."
              emptyLabel="All Clients"
            />

            <SearchableSelect
              value={selectedMatter}
              onChange={setSelectedMatter}
              options={matterOptions}
              onSearch={searchMatters}
              placeholder="Search matters..."
              emptyLabel="All Matters"
            />

            <SearchableSelect
              value={selectedCategory}
              onChange={setSelectedCategory}
              options={categoryOptions}
              placeholder="Search categories..."
              emptyLabel="All Categories"
            />
          </div>
        </div>

        {/* Options */}
        <div className="space-y-3 rounded-lg border border-slate-100 dark:border-slate-800 p-3">
          <p className="text-xs font-medium text-slate-600 dark:text-slate-400">Options</p>

          <label className={cn('flex items-center gap-3 cursor-pointer', !hasDrive && 'opacity-50')}>
            <input
              type="checkbox"
              checked={exportToDrive && hasDrive}
              onChange={(e) => setExportToDrive(e.target.checked)}
              disabled={!hasDrive}
              className="h-4 w-4 rounded border-slate-300 accent-emerald-600"
            />
            <div>
              <p className="text-sm text-slate-700 dark:text-slate-300">Export to Google Docs</p>
              {!hasDrive && (
                <p className="text-xs text-slate-400">Requires Google Workspace connection</p>
              )}
            </div>
          </label>

          <label className={cn('flex items-center gap-3 cursor-pointer', !hasDrive && 'opacity-50')}>
            <input
              type="checkbox"
              checked={sendEmail && hasDrive}
              onChange={(e) => setSendEmail(e.target.checked)}
              disabled={!hasDrive}
              className="h-4 w-4 rounded border-slate-300 accent-emerald-600"
            />
            <p className="text-sm text-slate-700 dark:text-slate-300">Send email notification</p>
          </label>

          {sendEmail && hasDrive && (
            <Input
              type="email"
              placeholder="recipient@firmname.com.ng"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              className="h-9 text-sm ml-7"
            />
          )}
        </div>

        <Button
          data-tour="generate-report-btn"
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
          onClick={() => void handleGenerate()}
          disabled={isGenerating}
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Play className="h-4 w-4 mr-2" />
              Generate Report
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// History list
// ============================================================================

function ReportHistoryList({
  reports,
  isLoading,
}: {
  reports: ReportRecord[];
  isLoading: boolean;
}) {
  return (
    <Card className="border-slate-200/80 dark:border-slate-700/80">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-slate-500" />
          <CardTitle className="text-base font-semibold">Report History</CardTitle>
        </div>
        <CardDescription className="text-xs">Previously generated reports</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
          </div>
        ) : reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <FileText className="h-10 w-10 text-slate-200 mb-2" />
            <p className="text-sm font-medium text-slate-500">No reports yet</p>
            <p className="text-xs text-slate-400 mt-0.5">Generated reports will appear here</p>
          </div>
        ) : (
          <div className="space-y-2">
            {reports.map((report) => (
              <div
                key={report.id}
                className="flex items-center gap-3 rounded-lg border border-slate-100 dark:border-slate-800 p-3"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/30">
                  <BarChart3 className="h-4 w-4 text-emerald-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                      {report.title}
                    </p>
                    <PeriodBadge period={report.period_label} />
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    <Calendar className="h-3 w-3 inline mr-1" />
                    {formatDate(report.generated_at)}
                    {(report.client_id || report.matter_id || report.matter_type) && (
                      <span className="ml-2 inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                        • Filtered
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      try {
                        const html = await downloadReportHtml(report.id);
                        const win = window.open('', '_blank');
                        if (win) {
                          win.document.open();
                          win.document.write(html);
                          win.document.close();
                          win.onload = () => {
                            win.print();
                          };
                        }
                      } catch (e) {
                        toast.error('Failed to download PDF report');
                      }
                    }}
                    className="flex items-center gap-1 shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 transition-colors"
                  >
                    <Download className="h-3 w-3" />
                    Print PDF
                  </button>
                  {report.drive_url && (
                    <a
                      href={report.drive_url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 shrink-0 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300 transition-colors"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Open
                    </a>
                  )}
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
// Main page
// ============================================================================

export function ReportsPage() {
  const { canUseReports, canUseDrive, isLoading: subLoading } = useSubscription();
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await listReports({ page_size: 20 });
      setReports(res.items);
    } catch {
      // Non-fatal
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!subLoading && canUseReports) void loadHistory();
    else if (!subLoading) setHistoryLoading(false);
  }, [subLoading, canUseReports, loadHistory]);

  if (subLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (!canUseReports) {
    return <ReportsGate />;
  }

  const handleGenerated = (record: ReportRecord) => {
    setReports((prev) => [record, ...prev]);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">Reports</h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Generate activity reports and export to Google Docs.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void loadHistory()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <GenerateForm onGenerated={handleGenerated} hasDrive={canUseDrive} />
        <ReportHistoryList reports={reports} isLoading={historyLoading} />
      </div>
    </div>
  );
}

export default ReportsPage;
