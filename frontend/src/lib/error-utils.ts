// ============================================================================
// LegalOps - Error Handling Utilities
// Centralised helpers for surfacing API errors in page components
// ============================================================================

import { toast } from 'sonner';
import { ApiClientError, NetworkError, PaymentRequiredError } from './api-client';
import { navigate } from './router';

/**
 * handleApiError — the standard error handler for page-level catch blocks.
 *
 * Behaviour by error type:
 *   PaymentRequiredError (402) — amber toast with "Upgrade" action linking to billing
 *   NetworkError               — persistent red toast with "Check connection" hint
 *   ApiClientError             — red toast with backend detail message
 *   unknown                    — red toast with the provided fallback message
 *
 * Usage:
 *   } catch (err) {
 *     handleApiError(err, 'Could not create matter.');
 *   }
 */
export function handleApiError(err: unknown, fallback: string): void {
  if (err instanceof PaymentRequiredError) {
    toast.error(err.detail, {
      duration: 10_000,
      action: {
        label: 'Upgrade Plan',
        onClick: () => navigate('/admin/billing'),
      },
    });
    return;
  }

  if (err instanceof NetworkError) {
    toast.error(err.message, {
      duration: 8_000,
      description: 'Check your internet connection and try again.',
    });
    return;
  }

  if (err instanceof ApiClientError) {
    toast.error(err.detail);
    return;
  }

  toast.error(fallback);
}

/**
 * extractErrorMessage — returns a plain string from any caught error.
 * Useful when you need to set an error state rather than fire a toast.
 */
export function extractErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof PaymentRequiredError) return err.detail;
  if (err instanceof ApiClientError) return err.detail;
  if (err instanceof NetworkError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}
