// ============================================================================
// LegalOps - Platform Admin API
// Calls /admin/* — only accessible when the user's org matches
// the PLATFORM_ADMIN_ORG_ID environment variable on the backend.
// ============================================================================

import apiClient from '../api-client';

// ── Shared types ──────────────────────────────────────────────────────────────

export interface PlatformOrgSummary {
  id: string;
  name: string;
  slug: string;
  plan: 'free' | 'pro' | 'agency';
  is_active: boolean;
  trial_active: boolean;
  trial_ends_at: string | null;
  paystack_customer_code: string | null;
  google_connected: boolean;
  feature_flags: Record<string, boolean> | null;
  member_count: number;
  matter_count: number;
  created_at: string;
}

export interface PlatformOrgMember {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  mfa_enabled: boolean;
  google_oauth_linked: boolean;
  joined_at: string;
}

export interface PlatformOrgDetail extends PlatformOrgSummary {
  trial_used: boolean;
  drive_webhook_active: boolean;
  drive_webhook_expires_at: string | null;
  usage: {
    matter_count: number;
    member_count: number;
    report_count: number;
  };
  members: PlatformOrgMember[];
}

export interface PlatformStats {
  organisations: {
    total: number;
    active: number;
    inactive: number;
    in_trial: number;
    by_plan: Record<string, number>;
  };
  users: { total_active: number };
  matters: { total: number };
  integrations: { google_connected: number };
}

export interface PlatformOrgListResponse {
  items: PlatformOrgSummary[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface OrgListParams {
  search?: string;
  plan?: string;
  trial_active?: boolean;
  page?: number;
  page_size?: number;
}

// ── API functions ─────────────────────────────────────────────────────────────

export async function getPlatformStats() {
  return apiClient.get<PlatformStats>('/admin/stats');
}

export async function listPlatformOrgs(params: OrgListParams = {}) {
  return apiClient.get<PlatformOrgListResponse>(
    '/admin/organisations',
    params as Record<string, string | number | boolean | undefined>
  );
}

export async function getPlatformOrg(orgId: string) {
  return apiClient.get<PlatformOrgDetail>(`/admin/organisations/${orgId}`);
}

export async function overrideOrgPlan(orgId: string, plan: 'free' | 'pro' | 'agency', reason?: string) {
  return apiClient.post<{ message: string; plan: string }>(`/admin/organisations/${orgId}/plan`, {
    plan,
    reason,
  });
}

export async function setOrgFeatureFlags(orgId: string, flags: Record<string, boolean>) {
  return apiClient.patch<{ effective_features: Record<string, boolean> }>(
    `/admin/organisations/${orgId}/features`,
    { flags }
  );
}

export async function extendOrgTrial(orgId: string, days: number) {
  return apiClient.post<{ trial_ends_at: string; days_extended: number }>(
    `/admin/organisations/${orgId}/extend-trial`,
    { days }
  );
}

export async function deactivateOrg(orgId: string) {
  return apiClient.post<{ message: string }>(`/admin/organisations/${orgId}/deactivate`);
}

export async function activateOrg(orgId: string) {
  return apiClient.post<{ message: string }>(`/admin/organisations/${orgId}/activate`);
}
