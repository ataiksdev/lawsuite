import apiClient from '../api-client';

export type BillingPlan = 'free' | 'pro' | 'agency' | 'trial';
export type PaidBillingPlan = 'pro' | 'agency';

// Feature flags — mirrors backend PLAN_FEATURES keys
export interface PlanFeatures {
  drive_integration: boolean;
  reports: boolean;
  mfa: boolean;
  advanced_tasks: boolean;
  api_access: boolean;
}

export interface SubscriptionLimits {
  max_matters: number | null;
  max_seats: number | null;
}

// FIX: Full response shape returned by GET /billing/subscription
export interface SubscriptionSummary {
  // Stored plan (free / pro / agency)
  plan: BillingPlan;
  // Resolved plan after applying trial and feature flag overrides
  effective_plan: BillingPlan;
  plan_name: string;
  amount_kobo: number;
  amount_ngn: number;
  // Trial window
  trial_active: boolean;
  trial_ends_at: string | null;
  // What the org can actually do right now
  features: PlanFeatures;
  limits: SubscriptionLimits;
  paystack_customer_code: string | null;
}

export interface CheckoutResponse {
  authorization_url: string;
  reference: string;
  access_code: string;
}

export interface BillingPortalResponse {
  portal_url: string;
  message: string;
}

export async function getSubscription() {
  return apiClient.get<SubscriptionSummary>('/billing/subscription');
}

export async function startCheckout(plan: PaidBillingPlan) {
  return apiClient.post<CheckoutResponse>('/billing/checkout', { plan });
}

export async function getBillingPortal() {
  return apiClient.get<BillingPortalResponse>('/billing/portal');
}
