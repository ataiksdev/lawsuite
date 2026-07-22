import apiClient from '../api-client';

export interface BackendAuditLog {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  summary: string;
  entry_metadata: Record<string, unknown>;
  created_at: string;
}

export interface BackendAuditLogListResponse {
  items: BackendAuditLog[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface AuditLogListParams {
  page?: number;
  page_size?: number;
}

export async function listAuditLogs(params: AuditLogListParams = {}) {
  return apiClient.get<BackendAuditLogListResponse>(
    '/audit-logs',
    params as Record<string, string | number | boolean | undefined>
  );
}
