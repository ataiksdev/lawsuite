import apiClient from '../api-client';

export type BackendMatterStatus =
  | 'intake'
  | 'open'
  | 'pending'
  | 'in_review'
  | 'closed'
  | 'archived';

export type BackendMatterType =
  | 'advisory'
  | 'litigation'
  | 'compliance'
  | 'drafting'
  | 'transactional';

export interface BackendMatterClient {
  id: string;
  name: string;
  email?: string | null;
}

export interface BackendMatter {
  id: string;
  organisation_id: string;
  client_id: string;
  client?: BackendMatterClient | null;
  assigned_to?: string | null;
  title: string;
  reference_no: string;
  matter_type: BackendMatterType;
  status: BackendMatterStatus;
  description?: string | null;
  drive_folder_url?: string | null;
  opened_at: string;
  target_close_at?: string | null;
  closed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface BackendMatterListResponse {
  items: BackendMatter[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface MatterListParams {
  status?: BackendMatterStatus;
  client_id?: string;
  assigned_to?: string;
  search?: string;
  page?: number;
  page_size?: number;
}

export interface MatterUpsertPayload {
  title: string;
  client_id: string;
  matter_type: BackendMatterType;
  description?: string;
  assigned_to?: string;
  target_close_at?: string;
}

export async function listMatters(params: MatterListParams = {}) {
  return apiClient.get<BackendMatterListResponse>(
    '/matters/',
    params as Record<string, string | number | boolean | undefined>
  );
}

export async function getMatter(matterId: string) {
  return apiClient.get<BackendMatter>(`/matters/${matterId}`);
}

export async function createMatter(payload: MatterUpsertPayload) {
  return apiClient.post<BackendMatter>('/matters/', payload);
}

export async function updateMatter(matterId: string, payload: Partial<MatterUpsertPayload>) {
  return apiClient.patch<BackendMatter>(`/matters/${matterId}`, payload);
}

export async function changeMatterStatus(
  matterId: string,
  payload: { status: BackendMatterStatus; reason?: string }
) {
  return apiClient.patch<BackendMatter>(`/matters/${matterId}/status`, payload);
}
