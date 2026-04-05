import apiClient from '../api-client';

export type BillingPlan = 'free' | 'pro' | 'agency';
export type PaidBillingPlan = Exclude<BillingPlan, 'free'>;

export interface SubscriptionLimits {
  max_matters: number | null;
  max_seats: number | null;
  drive_integration: boolean;
  reports: boolean;
}

export interface SubscriptionSummary {
  plan: BillingPlan;
  plan_name: string;
  amount_kobo: number;
  amount_ngn: number;
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
