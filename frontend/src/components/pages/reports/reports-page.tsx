'use client';

import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  Download,
  Eye,
  ExternalLink,
  HardDrive,
  Loader2,
  Mail,
  ChevronRight,
  FolderOpen,
  ShieldAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { ApiClientError } from '@/lib/api-client';
import {
  generateReport,
  getReport,
  listReports,
  type GeneratedReportResponse,
  type ReportClientActivity,
  type ReportData,
  type ReportPeriodType,
  type ReportRecord,
} from '@/lib/api/reports';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function ReportGeneratedDetailView({
  report,
  data,
  onClose,
}: {
  report: ReportRecord;
  data: ReportData;
  onClose: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onClose} className="h-8">
          <ChevronRight className="mr-1 h-4 w-4 rotate-180" />
          Back
        </Button>
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">{report.title}</h2>
          <p className="text-xs text-slate-500">
            {formatDate(report.date_from)} - {formatDate(report.date_to)} · Generated{' '}
            {formatDateTime(report.generated_at)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="border-slate-200/80 dark:border-slate-700/80">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-50">{data.total_events}</p>
            <p className="mt-0.5 text-xs text-slate-500">Total Events</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200/80 dark:border-slate-700/80">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-emerald-600">{data.matters_active}</p>
            <p className="mt-0.5 text-xs text-slate-500">Active Matters</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200/80 dark:border-slate-700/80">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-blue-600">{data.matters_opened}</p>
            <p className="mt-0.5 text-xs text-slate-500">Opened</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200/80 dark:border-slate-700/80">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-slate-400">{data.matters_closed}</p>
            <p className="mt-0.5 text-xs text-slate-500">Closed</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200/80 dark:border-slate-700/80">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Client Breakdown</CardTitle>
          <CardDescription className="text-xs">
            {data.clients.length} clients with report activity
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.clients.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-500">No client activity for this period.</p>
          ) : (
            data.clients.map((client: ReportClientActivity) => (
              <div key={client.client_id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FolderOpen className="h-4 w-4 text-emerald-600" />
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {client.client_name}
                    </span>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {client.matter_count} matter{client.matter_count === 1 ? '' : 's'}
                  </Badge>
                </div>
                <div className="space-y-2 border-l-2 border-slate-100 pl-4 dark:border-slate-800">
                  {client.matters.map((matter) => (
                    <div
                      key={matter.matter_id}
                      className="rounded-lg border border-slate-100 p-3 dark:border-slate-800"
                    >
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                        {matter.matter_title}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        {matter.reference_no} · {matter.status.replace(/_/g, ' ')}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-500">
                        <span>{matter.event_count} events</span>
                        <span>
                          {matter.tasks.completed}/{matter.tasks.total} tasks completed
                        </span>
                        <span>{matter.tasks.overdue} overdue</span>
                        <span>{matter.documents.added} docs added</span>
                        <span>{matter.documents.signed} signed</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ReportRecordDetailView({
  report,
  onClose,
}: {
  report: ReportRecord;
  onClose: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onClose} className="h-8">
          <ChevronRight className="mr-1 h-4 w-4 rotate-180" />
          Back
        </Button>
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">{report.title}</h2>
          <p className="text-xs text-slate-500">
            {formatDate(report.date_from)} - {formatDate(report.date_to)} · Generated{' '}
            {formatDateTime(report.generated_at)}
          </p>
        </div>
      </div>

      <Card className="border-slate-200/80 dark:border-slate-700/80">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Report Record</CardTitle>
          <CardDescription className="text-xs">
            Metadata currently persisted by the backend
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <DetailRow label="Title" value={report.title} />
          <DetailRow label="Period" value={report.period_label} />
          <DetailRow
            label="Date Range"
            value={`${formatDate(report.date_from)} - ${formatDate(report.date_to)}`}
          />
          <DetailRow label="Generated At" value={formatDateTime(report.generated_at)} />
          <DetailRow label="Drive Export" value={report.drive_url ? 'Available' : 'Not exported'} />

          {report.drive_url && (
            <Button
              variant="outline"
              onClick={() => window.open(report.drive_url || '', '_blank', 'noopener,noreferrer')}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Open Drive Copy
            </Button>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200/80 dark:border-slate-700/80">
        <CardContent className="flex items-start gap-3 p-4">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Historical aggregate breakdowns are not retrievable from the backend yet. The backend
            stores the report record and optional Drive export, but not a fetchable copy of the
            full generated `data` payload for past reports.
          </p>
        </CardContent>
      </Card>
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

export function ReportsPage() {
  const [periodType, setPeriodType] = useState<ReportPeriodType>('monthly');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [groupByClient, setGroupByClient] = useState(true);
  const [exportToDrive, setExportToDrive] = useState(false);
  const [sendViaEmail, setSendViaEmail] = useState(false);
  const [emailRecipient, setEmailRecipient] = useState('');
  const [generating, setGenerating] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [history, setHistory] = useState<ReportRecord[]>([]);
  const [selectedGeneratedReport, setSelectedGeneratedReport] =
    useState<GeneratedReportResponse | null>(null);
  const [selectedHistoricalReport, setSelectedHistoricalReport] = useState<ReportRecord | null>(null);
  const [loadingSelectedReportId, setLoadingSelectedReportId] = useState<string | null>(null);

  const [selectedEventTypes, setSelectedEventTypes] = useState<string[]>([
    'matter_created',
    'task_completed',
    'document_uploaded',
  ]);

  const eventTypes = [
    { value: 'matter_created', label: 'Matter Created' },
    { value: 'status_changed', label: 'Status Changed' },
    { value: 'task_created', label: 'Task Created' },
    { value: 'task_completed', label: 'Task Completed' },
    { value: 'document_uploaded', label: 'Document Uploaded' },
    { value: 'document_edited', label: 'Document Edited' },
    { value: 'email_linked', label: 'Email Linked' },
  ];

  const loadHistory = async () => {
    setLoadingHistory(true);
    setHistoryError(null);
    try {
      const response = await listReports({ page_size: 50 });
      setHistory(response.items);
    } catch (error) {
      const message =
        error instanceof ApiClientError ? error.detail : 'Unable to load report history.';
      setHistoryError(message);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    void loadHistory();
  }, []);

  const toggleEventType = (value: string) => {
    setSelectedEventTypes((prev) =>
      prev.includes(value) ? prev.filter((entry) => entry !== value) : [...prev, value]
    );
  };

  const handleGenerateReport = async () => {
    setGenerating(true);
    try {
      const response = await generateReport({
        period_type: periodType,
        date_from: periodType === 'custom' ? dateFrom || undefined : undefined,
        date_to: periodType === 'custom' ? dateTo || undefined : undefined,
        group_by_client: groupByClient,
        include_event_types: selectedEventTypes,
        export_to_drive: exportToDrive,
        send_email: sendViaEmail,
        recipient_email: sendViaEmail ? emailRecipient || undefined : undefined,
      });

      setSelectedGeneratedReport(response);
      setSelectedHistoricalReport(null);
      await loadHistory();
      toast.success('Report generated successfully.');
    } catch (error) {
      const message =
        error instanceof ApiClientError ? error.detail : 'Unable to generate report.';
      toast.error(message);
    } finally {
      setGenerating(false);
    }
  };

  const handleViewHistoricalReport = async (reportId: string) => {
    setLoadingSelectedReportId(reportId);
    try {
      const response = await getReport(reportId);
      setSelectedHistoricalReport(response);
      setSelectedGeneratedReport(null);
    } catch (error) {
      const message =
        error instanceof ApiClientError ? error.detail : 'Unable to load report record.';
      toast.error(message);
    } finally {
      setLoadingSelectedReportId(null);
    }
  };

  if (selectedGeneratedReport) {
    return (
      <ReportGeneratedDetailView
        report={selectedGeneratedReport.report}
        data={selectedGeneratedReport.data}
        onClose={() => setSelectedGeneratedReport(null)}
      />
    );
  }

  if (selectedHistoricalReport) {
    return (
      <ReportRecordDetailView
        report={selectedHistoricalReport}
        onClose={() => setSelectedHistoricalReport(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
          Reports
        </h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Generate and view practice analytics reports.
        </p>
      </div>

      <Card className="border-slate-200/80 dark:border-slate-700/80">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-emerald-600" />
            <CardTitle className="text-base font-semibold">Report Generator</CardTitle>
          </div>
          <CardDescription className="text-xs">
            Configure and generate a new report from the backend.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Period Type</Label>
            <div className="flex gap-2">
              {(['weekly', 'monthly', 'custom'] as const).map((type) => (
                <Button
                  key={type}
                  variant="outline"
                  size="sm"
                  className={type === periodType ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : ''}
                  onClick={() => setPeriodType(type)}
                >
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date-from">From</Label>
              <Input
                id="date-from"
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
                disabled={periodType !== 'custom'}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="date-to">To</Label>
              <Input
                id="date-to"
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
                disabled={periodType !== 'custom'}
              />
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Options
            </Label>

            <div className="flex items-center gap-2">
              <Checkbox
                id="group-by-client"
                checked={groupByClient}
                onCheckedChange={(checked) => setGroupByClient(Boolean(checked))}
              />
              <Label htmlFor="group-by-client" className="cursor-pointer text-sm font-normal">
                Group by client
              </Label>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-slate-500">Include Event Types</Label>
              <div className="flex flex-wrap gap-2">
                {eventTypes.map((eventType) => (
                  <label key={eventType.value} className="flex cursor-pointer items-center gap-1.5">
                    <Checkbox
                      checked={selectedEventTypes.includes(eventType.value)}
                      onCheckedChange={() => toggleEventType(eventType.value)}
                      className="h-3.5 w-3.5"
                    />
                    <span className="text-xs text-slate-600 dark:text-slate-400">
                      {eventType.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="export-drive"
                checked={exportToDrive}
                onCheckedChange={(checked) => setExportToDrive(Boolean(checked))}
              />
              <Label htmlFor="export-drive" className="cursor-pointer text-sm font-normal">
                <span className="flex items-center gap-1">
                  <HardDrive className="h-3.5 w-3.5" />
                  Export to Google Drive
                </span>
              </Label>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="send-email"
                checked={sendViaEmail}
                onCheckedChange={(checked) => setSendViaEmail(Boolean(checked))}
              />
              <Label htmlFor="send-email" className="cursor-pointer text-sm font-normal">
                <span className="flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5" />
                  Send via email
                </span>
              </Label>
            </div>

            {sendViaEmail && (
              <div className="ml-6">
                <Label htmlFor="email-recipient" className="text-xs">
                  Recipient Email
                </Label>
                <Input
                  id="email-recipient"
                  type="email"
                  placeholder="partners@lawfirm.com"
                  value={emailRecipient}
                  onChange={(event) => setEmailRecipient(event.target.value)}
                  className="mt-1 max-w-sm"
                />
              </div>
            )}
          </div>

          <div className="flex justify-end pt-2">
            <Button
              onClick={() => void handleGenerateReport()}
              disabled={
                generating ||
                (periodType === 'custom' && (!dateFrom || !dateTo)) ||
                (sendViaEmail && !emailRecipient.trim())
              }
              className="min-w-[180px] bg-emerald-600 hover:bg-emerald-700"
            >
              {generating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <BarChart3 className="mr-2 h-4 w-4" />
                  Generate Report
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200/80 dark:border-slate-700/80">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Report History</CardTitle>
          <CardDescription className="text-xs">
            {history.length} reports generated
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loadingHistory ? (
            <div className="flex items-center gap-3 p-6 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
              Loading report history...
            </div>
          ) : historyError ? (
            <div className="space-y-4 p-6">
              <p className="text-sm text-slate-600 dark:text-slate-400">{historyError}</p>
              <Button variant="outline" onClick={() => void loadHistory()}>
                Try Again
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-100 dark:border-slate-800">
                    <TableHead>Title</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead className="hidden md:table-cell">Date Range</TableHead>
                    <TableHead className="hidden lg:table-cell">Generated At</TableHead>
                    <TableHead className="hidden lg:table-cell">Drive</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((report) => (
                    <TableRow key={report.id} className="border-slate-50 dark:border-slate-800/50">
                      <TableCell>
                        <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                          {report.title}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {report.period_label}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden text-sm text-slate-500 md:table-cell">
                        {formatDate(report.date_from)} - {formatDate(report.date_to)}
                      </TableCell>
                      <TableCell className="hidden text-sm text-slate-500 lg:table-cell">
                        {formatDateTime(report.generated_at)}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {report.drive_url ? (
                          <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">
                            Exported
                          </Badge>
                        ) : (
                          <Badge variant="outline">No Drive copy</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => void handleViewHistoricalReport(report.id)}
                            disabled={loadingSelectedReportId === report.id}
                          >
                            {loadingSelectedReportId === report.id ? (
                              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Eye className="mr-1 h-3.5 w-3.5" />
                            )}
                            View
                          </Button>
                          {report.drive_url && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() =>
                                window.open(report.drive_url || '', '_blank', 'noopener,noreferrer')
                              }
                            >
                              <ExternalLink className="mr-1 h-3.5 w-3.5" />
                              Drive
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() =>
                              toast.info('PDF export is not implemented on the backend yet.')
                            }
                          >
                            <Download className="mr-1 h-3.5 w-3.5" />
                            PDF
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default ReportsPage;
