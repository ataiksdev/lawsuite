import apiClient from '../api-client';

export type ReportPeriodType = 'weekly' | 'monthly' | 'custom';

export interface ReportGeneratePayload {
  period_type: ReportPeriodType;
  date_from?: string;
  date_to?: string;
  group_by_client?: boolean;
  include_event_types?: string[];
  export_to_drive?: boolean;
  send_email?: boolean;
  recipient_email?: string;
}

export interface ReportTaskSummary {
  total: number;
  completed: number;
  overdue: number;
}

export interface ReportDocumentSummary {
  added: number;
  versioned: number;
  signed: number;
}

export interface ReportMatterActivity {
  matter_id: string;
  matter_title: string;
  reference_no: string;
  status: string;
  event_count: number;
  events_by_type: Record<string, number>;
  tasks: ReportTaskSummary;
  documents: ReportDocumentSummary;
}

export interface ReportClientActivity {
  client_id: string;
  client_name: string;
  matter_count: number;
  matters: ReportMatterActivity[];
}

export interface ReportData {
  org_id: string;
  org_name: string;
  period_label: string;
  date_from: string;
  date_to: string;
  generated_at: string;
  total_events: number;
  matters_active: number;
  matters_opened: number;
  matters_closed: number;
  clients: ReportClientActivity[];
}

export interface ReportRecord {
  id: string;
  organisation_id: string;
  title: string;
  period_label: string;
  date_from: string;
  date_to: string;
  drive_file_id?: string | null;
  drive_url?: string | null;
  generated_at: string;
  created_by?: string | null;
}

export interface GeneratedReportResponse {
  report: ReportRecord;
  data: ReportData;
}

export interface ReportHistoryResponse {
  items: ReportRecord[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export async function generateReport(payload: ReportGeneratePayload) {
  return apiClient.post<GeneratedReportResponse>('/reports/generate', payload);
}

export async function listReports(params: { page?: number; page_size?: number } = {}) {
  return apiClient.get<ReportHistoryResponse>('/reports/history', params);
}

export async function getReport(reportId: string) {
  return apiClient.get<ReportRecord>(`/reports/${reportId}`);
}
