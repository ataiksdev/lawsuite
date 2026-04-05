import apiClient from '../api-client';

export interface BackendClient {
  id: string;
  organisation_id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  is_active: boolean;
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

export async function archiveClient(clientId: string) {
  return apiClient.delete<void>(`/clients/${clientId}`);
}
