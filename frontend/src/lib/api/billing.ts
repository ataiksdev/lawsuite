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
  // Server-computed so the count can't drift from the client's own clock
  trial_days_remaining: number | null;
  // What the org can actually do right now
  features: PlanFeatures;
  limits: SubscriptionLimits;
  paystack_customer_code: string | null;
  paystack_public_key: string;
  // Whether we hold enough Paystack subscription info to cancel in-app
  can_cancel: boolean;
}

export interface CheckoutResponse {
  authorization_url: string;
  reference: string;
  access_code: string;
  amount_kobo: number;
}

export interface VerifyCheckoutResponse {
  verified: boolean;
  reference: string;
  status: string;
  plan: PaidBillingPlan;
  subscription: SubscriptionSummary;
}

export interface BillingTransaction {
  id: string;
  reference: string;
  plan: BillingPlan;
  amount_kobo: number;
  amount_ngn: number;
  status: string;
  paid_at: string;
}

export interface CancelSubscriptionResponse {
  cancelled: boolean;
  plan: BillingPlan;
}

export async function getSubscription() {
  return apiClient.get<SubscriptionSummary>('/billing/subscription');
}

export async function startCheckout(plan: PaidBillingPlan) {
  return apiClient.post<CheckoutResponse>('/billing/checkout', { plan });
}

export async function verifyCheckout(reference: string) {
  return apiClient.get<VerifyCheckoutResponse>('/billing/verify', { reference });
}

export async function getBillingHistory() {
  return apiClient.get<BillingTransaction[]>('/billing/history');
}

export async function cancelSubscription() {
  return apiClient.post<CancelSubscriptionResponse>('/billing/cancel', {});
}
