import apiClient from '../api-client';

export type ClientType = 'individual' | 'corporate';

export interface BackendClient {
  id: string;
  organisation_id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  is_active: boolean;
  client_type: ClientType;
  tin?: string | null;
  vat_registered: boolean;
  billing_address?: string | null;
  created_at: string;
  updated_at: string;
}

export interface BackendClientListResponse {
  items: BackendClient[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface ClientListParams {
  search?: string;
  include_inactive?: boolean;
  page?: number;
  page_size?: number;
}

export interface ClientUpsertPayload {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
  client_type?: ClientType;
  tin?: string;
  vat_registered?: boolean;
  billing_address?: string;
  // Client-generated key so a retried create request returns the original
  // row instead of creating a duplicate. Create-only, ignored on update.
  idempotency_key?: string;
}

export async function listClients(params: ClientListParams = {}) {
  return apiClient.get<BackendClientListResponse>(
    '/clients/',
    params as Record<string, string | number | boolean | undefined>
  );
}

export async function getClient(clientId: string) {
  return apiClient.get<BackendClient>(`/clients/${clientId}`);
}

export async function createClient(payload: ClientUpsertPayload) {
  return apiClient.post<BackendClient>('/clients/', payload);
}

export async function updateClient(clientId: string, payload: Partial<ClientUpsertPayload>) {
  return apiClient.patch<BackendClient>(`/clients/${clientId}`, payload);
}

// Archives the client (soft delete) if it has matters or invoices, or
// permanently deletes it if it doesn't — see backend ClientService for the
// exact rule. Callers can't tell which happened from this response alone
// (the deleted-row snapshot looks the same shape); check with getClient().
export async function archiveClient(clientId: string) {
  return apiClient.delete<BackendClient>(`/clients/${clientId}`);
}
