// ============================================================================
// LegalOps - Trial Banner
// Shows trial status and days remaining at the top of the app shell
// ============================================================================

'use client';

import React from 'react';
import { AlertTriangle, Crown, X } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useSubscription } from '@/hooks/use-subscription';
import { navigate } from '@/lib/router';

function getDaysRemaining(endsAt: Date): number {
  const now = new Date();
  const diff = endsAt.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export function TrialBanner() {
  const { isOnTrial, trialEndsAt, isLoading } = useSubscription();
  const [dismissed, setDismissed] = useState(false);

  if (isLoading || !isOnTrial || !trialEndsAt || dismissed) return null;

  const daysLeft = getDaysRemaining(trialEndsAt);
  const isUrgent = daysLeft <= 5;

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 px-4 py-2 text-sm',
        isUrgent
          ? 'bg-amber-50 border-b border-amber-200 text-amber-800 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300'
          : 'bg-emerald-50 border-b border-emerald-200 text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300'
      )}
    >
      <div className="flex items-center gap-2">
        {isUrgent ? (
          <AlertTriangle className="h-4 w-4 shrink-0" />
        ) : (
          <Crown className="h-4 w-4 shrink-0" />
        )}
        <span>
          {daysLeft === 0 ? (
            <>Your free trial <strong>expires today</strong>. Upgrade to keep all features.</>
          ) : (
            <>
              Your free trial ends in{' '}
              <strong>{daysLeft} {daysLeft === 1 ? 'day' : 'days'}</strong>.
              You have full access to all Pro features until then.
            </>
          )}
        </span>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => navigate('/admin/billing')}
          className={cn(
            'text-xs font-semibold underline-offset-2 hover:underline',
            isUrgent ? 'text-amber-900 dark:text-amber-200' : 'text-emerald-900 dark:text-emerald-200'
          )}
        >
          Upgrade Now
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="text-current opacity-60 hover:opacity-100 transition-opacity"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
