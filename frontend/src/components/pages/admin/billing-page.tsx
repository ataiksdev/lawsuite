'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  CreditCard,
  Crown,
  Download,
  Star,
  Loader2,
  ShieldAlert,
  Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/lib/auth-store';
import { ApiClientError } from '@/lib/api-client';
import { UserRole } from '@/lib/types';
import { replaceNavigation } from '@/lib/router';
import {
  getBillingPortal,
  getSubscription,
  startCheckout,
  type BillingPlan,
  type PaidBillingPlan,
  type SubscriptionSummary,
  verifyCheckout,
} from '@/lib/api/billing';
import { listMembers } from '@/lib/api/members';
import { listMatters } from '@/lib/api/matters';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

interface PlanConfig {
  key: BillingPlan;
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  limits: { members: number | null; matters: number | null };
  badge: string;
  badgeClass: string;
  popular?: boolean;
}

const plans: PlanConfig[] = [
  {
    key: 'free',
    name: 'Free',
    price: '\u20a60',
    period: 'forever',
    description: 'Get started with core legal practice management.',
    features: ['1 seat included', 'Up to 5 active matters', 'Core matter management', 'Standard support'],
    limits: { members: 1, matters: 5 },
    badge: 'Free',
    badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
  },
  {
    key: 'pro',
    name: 'Pro',
    price: '\u20a629,000',
    period: '/month',
    description: 'Advanced features for growing firms.',
    features: ['Up to 5 seats', 'Unlimited matters', 'Google Workspace integration', 'Reports and analytics', 'Priority support'],
    limits: { members: 5, matters: null },
    badge: 'Pro',
    badgeClass: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    popular: true,
  },
  {
    key: 'agency',
    name: 'Agency',
    price: '\u20a679,000',
    period: '/month',
    description: 'Full power for large firms and agencies.',
    features: ['Unlimited seats', 'Unlimited matters', 'All paid integrations', 'Dedicated support', 'Scale-ready billing'],
    limits: { members: null, matters: null },
    badge: 'Agency',
    badgeClass: 'bg-amber-100 text-amber-700 border-amber-200',
  },
];

const PLAN_ORDER: Record<BillingPlan, number> = {
  free: 0,
  trial: 0,
  pro: 1,
  agency: 2,
};

function getBillingCallbackParams() {
  if (typeof window === 'undefined') {
    return null;
  }

  const hash = window.location.hash;
  if (!hash.includes('?')) {
    return null;
  }

  const query = hash.split('?')[1] ?? '';
  const params = new URLSearchParams(query);
  const state = params.get('paystack');
  const reference = params.get('reference') ?? params.get('trxref');

  if (!state && !reference) {
    return null;
  }

  return { state, reference };
}

function UsageMeter({
  label,
  current,
  limit,
  unit,
}: {
  label: string;
  current: number;
  limit: number | null;
  unit: string;
}) {
  const percentage = limit && limit > 0 ? Math.min(Math.round((current / limit) * 100), 100) : 0;
  const isNearLimit = percentage >= 80;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-600 dark:text-slate-400">{label}</span>
        <span className={cn('text-sm font-medium', isNearLimit ? 'text-amber-600' : 'text-slate-900 dark:text-slate-100')}>
          {current} / {limit === null ? 'Unlimited' : limit} {unit}
        </span>
      </div>
      {limit === null ? (
        <div className="rounded-full bg-slate-100 px-3 py-2 text-xs text-slate-500 dark:bg-slate-900 dark:text-slate-400">
          Unlimited on this plan
        </div>
      ) : (
        <Progress value={percentage} className={cn('h-2', isNearLimit ? '[&>div]:bg-amber-500' : '[&>div]:bg-emerald-500')} />
      )}
    </div>
  );
}

function PlanCard({
  plan,
  currentPlan,
  isBusy,
  onUpgrade,
}: {
  plan: PlanConfig;
  currentPlan: BillingPlan;
  isBusy: boolean;
  onUpgrade: (plan: PaidBillingPlan) => Promise<void>;
}) {
  const comparableCurrentPlan = currentPlan === 'trial' ? 'free' : currentPlan;
  const currentRank = PLAN_ORDER[comparableCurrentPlan];
  const targetRank = PLAN_ORDER[plan.key];
  const isCurrent = plan.key === currentPlan || (currentPlan === 'trial' && plan.key === 'free');
  const isDowngrade = targetRank < currentRank;
  const ctaLabel = currentRank === 0 ? 'Subscribe' : 'Upgrade';

  return (
    <Card
      className={cn(
        'relative border-slate-200/80 dark:border-slate-700/80',
        plan.popular && 'border-emerald-300 shadow-lg shadow-emerald-100/50 dark:border-emerald-700 dark:shadow-emerald-900/20'
      )}
    >
      {plan.popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge className="border-emerald-600 bg-emerald-600 px-3 py-0.5 text-xs font-semibold text-white">
            <Star className="mr-1 h-3 w-3" />
            Most Popular
          </Badge>
        </div>
      )}
      <CardHeader className="pb-3">
        <div className="mb-1 flex items-center gap-2">
          <Badge className={cn('border text-xs font-semibold', plan.badgeClass)}>{plan.badge}</Badge>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold text-slate-900 dark:text-slate-50">{plan.price}</span>
          {plan.period !== 'forever' && <span className="text-sm text-slate-500">{plan.period}</span>}
        </div>
        <CardDescription className="text-xs">{plan.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="mb-4 space-y-2">
          {plan.features.map((feature) => (
            <li key={feature} className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
              <span className="text-xs text-slate-600 dark:text-slate-400">{feature}</span>
            </li>
          ))}
        </ul>
        {isCurrent ? (
          <Button variant="outline" className="w-full" disabled>
            Current Plan
          </Button>
        ) : plan.key === 'free' || isDowngrade ? (
          <Button variant="outline" className="w-full" disabled>
            Downgrade via Support
          </Button>
        ) : (
          <Button
            className={cn(
              'w-full text-white',
              plan.popular ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-900 hover:bg-slate-800'
            )}
            onClick={() => void onUpgrade(plan.key as PaidBillingPlan)}
            disabled={isBusy}
          >
            {isBusy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Redirecting...
              </>
            ) : (
              <>
                <Crown className="mr-2 h-4 w-4" />
                {ctaLabel}
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function BillingPage() {
  const { user, organisation } = useAuthStore();
  const handledCheckoutRef = useRef<string | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionSummary | null>(null);
  const [memberCount, setMemberCount] = useState(0);
  const [matterCount, setMatterCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkoutPlan, setCheckoutPlan] = useState<PaidBillingPlan | null>(null);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [isVerifyingCheckout, setIsVerifyingCheckout] = useState(false);
  const [checkoutMessage, setCheckoutMessage] = useState<{
    tone: 'success' | 'warning' | 'error';
    title: string;
    detail: string;
  } | null>(null);

  const loadBilling = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [subscriptionResponse, membersResponse, mattersResponse] = await Promise.all([
        getSubscription(),
        listMembers(),
        listMatters({ page_size: 1 }),
      ]);

      setSubscription(subscriptionResponse);
      setMemberCount(membersResponse.length);
      setMatterCount(mattersResponse.total);
      return subscriptionResponse;
    } catch (err) {
      const message =
        err instanceof ApiClientError ? err.detail : 'Unable to load billing information right now.';
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadBilling();
  }, []);

  useEffect(() => {
    const callback = getBillingCallbackParams();
    if (!callback) {
      return;
    }

    const marker = `${callback.state ?? 'unknown'}:${callback.reference ?? 'none'}`;
    if (handledCheckoutRef.current === marker) {
      return;
    }
    handledCheckoutRef.current = marker;

    const handleCallback = async () => {
      if (callback.state === 'cancelled') {
        setCheckoutMessage({
          tone: 'warning',
          title: 'Checkout cancelled',
          detail: 'No payment was taken. You can restart checkout whenever you are ready.',
        });
        setCheckoutPlan(null);
        replaceNavigation('/admin/billing');
        return;
      }

      if (!callback.reference) {
        setCheckoutMessage({
          tone: 'warning',
          title: 'Awaiting payment confirmation',
          detail: 'We are waiting for Paystack to return a transaction reference for this checkout.',
        });
        await loadBilling();
        replaceNavigation('/admin/billing');
        return;
      }

      setIsVerifyingCheckout(true);
      try {
        const result = await verifyCheckout(callback.reference);
        setSubscription(result.subscription);
        setCheckoutMessage({
          tone: 'success',
          title: `${result.plan === 'agency' ? 'Agency' : 'Pro'} plan activated`,
          detail: 'Your payment was confirmed with Paystack and your subscription is now active.',
        });
        toast.success(`Payment confirmed. Your ${result.plan} plan is active.`);
      } catch (err) {
        const message =
          err instanceof ApiClientError ? err.detail : 'We could not verify your payment yet.';
        setCheckoutMessage({
          tone: 'error',
          title: 'Payment verification pending',
          detail: message,
        });
        toast.error(message);
      } finally {
        setCheckoutPlan(null);
        setIsVerifyingCheckout(false);
        await loadBilling();
        replaceNavigation('/admin/billing');
      }
    };

    void handleCallback();
  }, []);

  const currentPlanConfig = useMemo(() => {
    if (!subscription) {
      return null;
    }
    return plans.find((plan) => plan.key === subscription.plan) ?? plans[0];
  }, [subscription]);

  if (user?.role !== UserRole.ADMIN) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Crown className="mb-4 h-12 w-12 text-slate-300" />
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Access Denied</h2>
        <p className="mt-1 text-sm text-slate-500">Only administrators can manage billing.</p>
      </div>
    );
  }

  const handleUpgrade = async (plan: PaidBillingPlan) => {
    setCheckoutPlan(plan);
    try {
      const response = await startCheckout(plan);
      window.location.href = response.authorization_url;
    } catch (err) {
      const message =
        err instanceof ApiClientError ? err.detail : 'Unable to start checkout right now.';
      toast.error(message);
      setCheckoutPlan(null);
    }
  };

  const handleManageSubscription = async () => {
    setOpeningPortal(true);
    try {
      const response = await getBillingPortal();
      window.location.href = response.portal_url;
    } catch (err) {
      const message =
        err instanceof ApiClientError ? err.detail : 'Unable to open the subscription portal.';
      toast.error(message);
      setOpeningPortal(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
          Billing & Subscription
        </h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Subscribe, upgrade, and manage your firm&apos;s plan with Paystack.
        </p>
      </div>

      {checkoutMessage && (
        <Card
          className={cn(
            'border',
            checkoutMessage.tone === 'success' && 'border-emerald-200 bg-emerald-50/80 dark:border-emerald-800 dark:bg-emerald-950/20',
            checkoutMessage.tone === 'warning' && 'border-amber-200 bg-amber-50/80 dark:border-amber-800 dark:bg-amber-950/20',
            checkoutMessage.tone === 'error' && 'border-rose-200 bg-rose-50/80 dark:border-rose-800 dark:bg-rose-950/20'
          )}
        >
          <CardContent className="py-4">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{checkoutMessage.title}</p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{checkoutMessage.detail}</p>
          </CardContent>
        </Card>
      )}

      {isLoading || isVerifyingCheckout ? (
        <Card className="border-slate-200/80 dark:border-slate-700/80">
          <CardContent className="flex items-center gap-3 py-10">
            <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
            <span className="text-sm text-slate-600 dark:text-slate-400">
              {isVerifyingCheckout ? 'Confirming your Paystack payment...' : 'Loading subscription details...'}
            </span>
          </CardContent>
        </Card>
      ) : error || !subscription || !currentPlanConfig ? (
        <Card className="border-slate-200/80 dark:border-slate-700/80">
          <CardContent className="space-y-4 py-8">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {error || 'Billing information is currently unavailable.'}
            </p>
            <Button variant="outline" onClick={() => void loadBilling()}>
              Try Again
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="border-slate-200/80 dark:border-slate-700/80">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Current Plan</CardTitle>
                  <CardDescription className="mt-0.5">
                    Your subscription details and usage
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {subscription.trial_active && (
                    <Badge className="border-purple-200 bg-purple-100 px-2 py-1 text-xs font-semibold text-purple-700">
                      <Clock className="mr-1 h-3 w-3" />
                      Trial Active
                    </Badge>
                  )}
                  <Badge className={cn('border px-3 py-1 text-sm font-semibold', currentPlanConfig.badgeClass)}>
                    {currentPlanConfig.name}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900">
                  <p className="mb-1 text-xs text-slate-500">Organisation</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {organisation?.name || 'Current organisation'}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900">
                  <p className="mb-1 text-xs text-slate-500">Monthly Price</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {subscription.amount_kobo === 0
                      ? 'Free'
                      : `₦${subscription.amount_ngn.toLocaleString('en-NG')}/month`}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900">
                  <p className="mb-1 text-xs text-slate-500">Paystack Customer</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {subscription.paystack_customer_code || 'Not created yet'}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900">
                  <p className="mb-1 text-xs text-slate-500">Active Features</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {[
                      subscription.features?.drive_integration ? 'Drive' : null,
                      subscription.features?.reports ? 'Reports' : null,
                      subscription.features?.api_access ? 'API' : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'Core features only'}
                  </p>
                </div>
              </div>

              {subscription.trial_active && subscription.trial_ends_at && (
                <div className="mb-4 flex items-center gap-3 rounded-lg border border-purple-200 bg-purple-50 px-4 py-3 dark:border-purple-800 dark:bg-purple-950/20">
                  <Clock className="h-4 w-4 shrink-0 text-purple-600" />
                  <div className="text-sm">
                    <span className="font-medium text-purple-800 dark:text-purple-300">Free trial active — </span>
                    <span className="text-purple-700 dark:text-purple-400">
                      expires {new Date(subscription.trial_ends_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}.
                      You have full access to all Pro features.
                    </span>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Usage</h4>
                <UsageMeter
                  label="Seats"
                  current={memberCount}
                  limit={subscription.limits.max_seats}
                  unit="members"
                />
                <UsageMeter
                  label="Active Matters"
                  current={matterCount}
                  limit={subscription.limits.max_matters}
                  unit="matters"
                />
              </div>
            </CardContent>
          </Card>

          <div>
            <h2 className="mb-3 text-base font-semibold text-slate-900 dark:text-slate-100">
              Compare Plans
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {plans.map((plan) => (
                <PlanCard
                  key={plan.name}
                  plan={plan}
                  currentPlan={subscription.effective_plan ?? subscription.plan}
                  isBusy={checkoutPlan === plan.key}
                  onUpgrade={handleUpgrade}
                />
              ))}
            </div>
          </div>

          <Card className="border-slate-200/80 dark:border-slate-700/80">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Payments & Receipts</CardTitle>
              <CardDescription className="text-xs">
                Manage billing activity through your Paystack subscription
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-3 rounded-lg bg-slate-50 p-4 dark:bg-slate-900">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    Your active subscription is billed securely through Paystack.
                  </p>
                  <ul className="space-y-1 text-sm text-slate-500 dark:text-slate-400">
                    <li>Open the Paystack portal to update payment methods or manage your subscription.</li>
                    <li>Receipts and charge history are available from your Paystack billing records.</li>
                    <li>Any successful plan change will sync back here automatically after payment confirmation.</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={() => void handleManageSubscription()}
              disabled={openingPortal || !subscription.paystack_customer_code}
            >
              <CreditCard className="mr-2 h-4 w-4" />
              {openingPortal ? 'Opening Portal...' : 'Manage Subscription'}
            </Button>
            <Button
              variant="outline"
              onClick={() => void handleManageSubscription()}
              disabled={openingPortal || !subscription.paystack_customer_code}
            >
              <Download className="mr-2 h-4 w-4" />
              View Receipts in Paystack
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export default BillingPage;
