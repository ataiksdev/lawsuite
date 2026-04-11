// ============================================================================
// LegalOps - Reset Password Page
// ============================================================================

'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Eye, EyeOff, Loader2, ArrowLeft, Lock, CheckCircle2, Check, X } from 'lucide-react';
import { toast } from 'sonner';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { UnauthenticatedLayout } from './unauthenticated-layout';
import { navigate } from '@/lib/router';
import apiClient, { ApiClientError } from '@/lib/api-client';
import { cn } from '@/lib/utils';

// ── Password checks (same rules as registration) ─────────────────────────────

interface PasswordChecks {
  minLength: boolean;
  hasUppercase: boolean;
  hasDigit: boolean;
}

function checkPassword(v: string): PasswordChecks {
  return {
    minLength: v.length >= 8,
    hasUppercase: /[A-Z]/.test(v),
    hasDigit: /\d/.test(v),
  };
}

export function ResetPasswordPage() {
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [serverError, setServerError] = useState('');

  const checks = useMemo(() => checkPassword(password), [password]);

  useEffect(() => {
    const hash = window.location.hash;
    const queryString = hash.includes('?') ? hash.split('?')[1] : window.location.search.slice(1);
    const params = new URLSearchParams(queryString);
    const t = params.get('token');
    if (t) {
      setToken(t);
    } else {
      toast.error('Missing reset token. Please check your link.');
      setTimeout(() => navigate('/login'), 1500);
    }
  }, []);

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!password) {
      next.password = 'Password is required';
    } else if (!checks.minLength || !checks.hasUppercase || !checks.hasDigit) {
      next.password = 'Password does not meet all requirements';
    }
    if (!confirmPassword) {
      next.confirm = 'Please confirm your new password';
    } else if (password !== confirmPassword) {
      next.confirm = 'Passwords do not match';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError('');
    if (!validate()) return;

    setIsLoading(true);
    try {
      await apiClient.post('/auth/reset-password', { token, password }, { skipAuth: true });
      setIsSuccess(true);
      toast.success('Password reset successfully!');
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      // ApiClientError carries the exact backend message (e.g. "Reset token has expired")
      const detail =
        err instanceof ApiClientError
          ? err.detail
          : 'Failed to reset password. The link may be expired.';
      setServerError(detail);
      toast.error(detail);
    } finally {
      setIsLoading(false);
    }
  };

  const requirements = [
    { label: 'At least 8 characters', met: checks.minLength },
    { label: 'One uppercase letter', met: checks.hasUppercase },
    { label: 'One digit (number)', met: checks.hasDigit },
  ];

  if (isSuccess) {
    return (
      <UnauthenticatedLayout>
        <Card className="border-slate-200/80 dark:border-slate-800/80 shadow-xl">
          <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
            <div className="h-14 w-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <CheckCircle2 className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-slate-900 dark:text-slate-50">Password Reset!</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Redirecting you to login…
              </p>
            </div>
            <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => navigate('/login')}>
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </UnauthenticatedLayout>
    );
  }

  return (
    <UnauthenticatedLayout>
      <Card className="border-slate-200/80 dark:border-slate-800/80 shadow-xl">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
            <Lock className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <CardTitle className="text-xl">Set new password</CardTitle>
          <CardDescription>Choose a strong password for your account</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Server error banner */}
            {serverError && (
              <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20 px-4 py-3">
                <p className="text-sm text-red-700 dark:text-red-400">{serverError}</p>
              </div>
            )}

            {/* New password */}
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Create a strong password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errors.password) setErrors((p) => ({ ...p, password: '' }));
                    setServerError('');
                  }}
                  className="h-10 pr-10"
                  autoComplete="new-password"
                  aria-invalid={!!errors.password}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-red-500">{errors.password}</p>}

              {/* Requirements */}
              {password && (
                <ul className="space-y-1 mt-1">
                  {requirements.map((req) => (
                    <li
                      key={req.label}
                      className={cn(
                        'flex items-center gap-1.5 text-xs transition-colors',
                        req.met ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'
                      )}
                    >
                      {req.met ? <Check className="h-3 w-3 shrink-0" /> : <X className="h-3 w-3 shrink-0" />}
                      {req.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Confirm password */}
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm New Password</Label>
              <div className="relative">
                <Input
                  id="confirm-password"
                  type={showConfirm ? 'text' : 'password'}
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (errors.confirm) setErrors((p) => ({ ...p, confirm: '' }));
                  }}
                  className="h-10 pr-10"
                  autoComplete="new-password"
                  aria-invalid={!!errors.confirm}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.confirm && <p className="text-xs text-red-500">{errors.confirm}</p>}
            </div>

            <Button
              type="submit"
              className="w-full h-10 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
              disabled={isLoading}
            >
              {isLoading ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Resetting password…</>
              ) : (
                'Reset Password'
              )}
            </Button>
          </form>

          <p className="text-center text-sm text-slate-500 dark:text-slate-400 mt-6">
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 font-medium"
            >
              <ArrowLeft className="h-3 w-3" />
              Back to Sign In
            </button>
          </p>
        </CardContent>
      </Card>
    </UnauthenticatedLayout>
  );
}

export default ResetPasswordPage;
