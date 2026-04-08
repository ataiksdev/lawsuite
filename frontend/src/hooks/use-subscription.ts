// ============================================================================
// LegalOps - useSubscription hook
// Fetches subscription + resolves trial/feature state once per session
// ============================================================================

'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSubscription, type SubscriptionSummary } from '@/lib/api/billing';

interface UseSubscriptionReturn {
  subscription: SubscriptionSummary | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  // Convenience feature checks
  canUseDrive: boolean;
  canUseReports: boolean;
  canUseMfa: boolean;
  isOnTrial: boolean;
  trialEndsAt: Date | null;
}

let _cached: SubscriptionSummary | null = null;
let _fetchedAt: number | null = null;
const CACHE_MS = 60_000; // 1-minute cache — avoid hammering /billing/subscription on every page

export function useSubscription(): UseSubscriptionReturn {
  const [subscription, setSubscription] = useState<SubscriptionSummary | null>(_cached);
  const [isLoading, setIsLoading] = useState(!_cached);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    // Use cache if fresh
    if (_cached && _fetchedAt && Date.now() - _fetchedAt < CACHE_MS) {
      setSubscription(_cached);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const data = await getSubscription();
      _cached = data;
      _fetchedAt = Date.now();
      setSubscription(data);
    } catch {
      setError('Could not load subscription details.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  return {
    subscription,
    isLoading,
    error,
    refetch: fetch,
    canUseDrive: subscription?.features?.drive_integration ?? false,
    canUseReports: subscription?.features?.reports ?? false,
    canUseMfa: subscription?.features?.mfa ?? true,
    isOnTrial: subscription?.trial_active ?? false,
    trialEndsAt: subscription?.trial_ends_at ? new Date(subscription.trial_ends_at) : null,
  };
}
