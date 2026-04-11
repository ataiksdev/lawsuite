// ============================================================================
// LegalOps - Accept Invite Page
// Invitation acceptance with password setup
// ============================================================================

'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Eye, EyeOff, Loader2, Check, X, Mail, User, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { UnauthenticatedLayout } from './unauthenticated-layout';
import { navigate } from '@/lib/router';
import { useAuthStore } from '@/lib/auth-store';
import { cn } from '@/lib/utils';

// ============================================================================
// Password Strength Helpers (shared with register page)
// ============================================================================

interface PasswordChecks {
  minLength: boolean;
  hasUppercase: boolean;
  hasDigit: boolean;
}

function checkPassword(password: string): PasswordChecks {
  return {
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasDigit: /\d/.test(password),
  };
}

// ============================================================================
// Accept Invite Page Component
// ============================================================================

export function AcceptInvitePage() {
  const acceptInvite = useAuthStore((s) => s.acceptInvite);
  const authError = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);
  const [token, setToken] = useState<string>('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSuccess, setIsSuccess] = useState(false);

  const passwordChecks = useMemo(() => checkPassword(password), [password]);

  // Parse token from URL hash params on mount
  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.split('?')[1] || '');
    const tokenParam = params.get('token');

    if (!tokenParam) {
      toast.error('Invalid or missing invite token');
      return;
    }

    setToken(tokenParam);
  }, []);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!password) {
      newErrors.password = 'Password is required';
    } else if (!passwordChecks.minLength || !passwordChecks.hasUppercase || !passwordChecks.hasDigit) {
      newErrors.password = 'Password does not meet all requirements';
    }

    if (!confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      await acceptInvite(token, password);
      setIsSuccess(true);
      setTimeout(() => navigate('/'), 1500);
    } catch {
      // auth store already called toast.error() with the exact backend detail
      // (e.g. "Invalid invite token" / "Invite token has expired")
      // authError state is set and displayed in the inline banner below
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogin = () => {
    navigate('/login');
  };

  // No token found
  if (!token) {
    return (
      <UnauthenticatedLayout>
        <Card className="border-slate-200/80 dark:border-slate-800/80 shadow-xl shadow-slate-200/30 dark:shadow-slate-900/30">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-xl">Invalid Invitation</CardTitle>
            <CardDescription>
              This invitation link is invalid or has expired.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center">
              Please contact your administrator for a new invitation link.
            </p>
            <Button
              variant="outline"
              onClick={handleLogin}
              className="text-emerald-600 border-emerald-200 dark:border-emerald-800"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Sign In
            </Button>
          </CardContent>
        </Card>
      </UnauthenticatedLayout>
    );
  }

  // Success state
  if (isSuccess) {
    return (
      <UnauthenticatedLayout>
        <Card className="border-slate-200/80 dark:border-slate-800/80 shadow-xl shadow-slate-200/30 dark:shadow-slate-900/30">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="h-12 w-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mb-4">
              <Check className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-1">
              Invitation Accepted!
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Redirecting you to your dashboard...
            </p>
          </CardContent>
        </Card>
      </UnauthenticatedLayout>
    );
  }

  const requirements = [
    { key: 'minLength', label: 'At least 8 characters', met: passwordChecks.minLength },
    { key: 'hasUppercase', label: 'One uppercase letter', met: passwordChecks.hasUppercase },
    { key: 'hasDigit', label: 'One digit (number)', met: passwordChecks.hasDigit },
  ];

  return (
    <UnauthenticatedLayout>
      <Card className="border-slate-200/80 dark:border-slate-800/80 shadow-xl shadow-slate-200/30 dark:shadow-slate-900/30">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-xl">Accept Invitation</CardTitle>
          <CardDescription>
            Set your password to join the organisation
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Invited user info */}
          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 p-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <User className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                  Invitation Ready
                </p>
                <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                  <Mail className="h-3 w-3 shrink-0" />
                  <span className="truncate">Use the invite link to finish setting your password</span>
                </div>
              </div>
            </div>
            <div className="mt-3">
              <Badge
                variant="secondary"
                className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 text-xs"
              >
                Secure account setup
              </Badge>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Inline server error */}
            {authError && (
              <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20 px-4 py-3">
                <p className="text-sm text-red-700 dark:text-red-400">{authError}</p>
              </div>
            )}

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="invite-password">New Password</Label>
              <div className="relative">
                <Input
                  id="invite-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Create a strong password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errors.password) setErrors((p) => ({ ...p, password: '' }));
                    if (authError) clearError();
                  }}
                  className="h-10 pr-10"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-red-500">{errors.password}</p>
              )}

              {/* Requirements */}
              {password && (
                <ul className="space-y-1 mt-2">
                  {requirements.map((req) => (
                    <li
                      key={req.key}
                      className={cn(
                        'flex items-center gap-1.5 text-xs transition-colors',
                        req.met
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-slate-400 dark:text-slate-500'
                      )}
                    >
                      {req.met ? (
                        <Check className="h-3 w-3 shrink-0" />
                      ) : (
                        <X className="h-3 w-3 shrink-0" />
                      )}
                      {req.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <Label htmlFor="invite-confirm-password">Confirm New Password</Label>
              <div className="relative">
                <Input
                  id="invite-confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (errors.confirmPassword)
                      setErrors((p) => ({ ...p, confirmPassword: '' }));
                  }}
                  className="h-10 pr-10"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                  tabIndex={-1}
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="text-xs text-red-500">{errors.confirmPassword}</p>
              )}
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full h-10 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Accepting invitation...
                </>
              ) : (
                'Accept Invitation & Set Password'
              )}
            </Button>
          </form>

          {/* Back to Login */}
          <p className="text-center text-sm text-slate-500 dark:text-slate-400 mt-6">
            <button
              type="button"
              onClick={handleLogin}
              className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 font-medium"
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

export default AcceptInvitePage;
