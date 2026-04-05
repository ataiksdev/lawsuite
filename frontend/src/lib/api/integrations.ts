import apiClient from '../api-client';

export interface GoogleIntegrationStatus {
  connected: boolean;
  scopes: string[];
  token_expiry: string | null;
  webhook_active: boolean;
  webhook_expires_at: string | null;
}

export interface GoogleConnectResponse {
  authorization_url: string;
  state: string;
}

export interface GoogleDisconnectResponse {
  message: string;
}

export async function getGoogleIntegrationStatus() {
  return apiClient.get<GoogleIntegrationStatus>('/integrations/google/status');
}

export async function getGoogleAuthorizationUrl() {
  return apiClient.get<GoogleConnectResponse>('/integrations/google/connect');
}

export async function disconnectGoogleWorkspace() {
  return apiClient.delete<GoogleDisconnectResponse>('/integrations/google');
}
