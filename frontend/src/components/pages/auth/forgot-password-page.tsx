// ============================================================================
// LegalOps - Forgot Password Page
// ============================================================================

'use client';

import React, { useState } from 'react';
import { Loader2, ArrowLeft, Mail, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { UnauthenticatedLayout } from './unauthenticated-layout';
import { navigate } from '@/lib/router';
import apiClient, { ApiClientError } from '@/lib/api-client';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [serverError, setServerError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const validateEmail = (value: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!value.trim()) {
      setEmailError('Email address is required');
      return false;
    }
    if (!emailRegex.test(value)) {
      setEmailError('Please enter a valid email address');
      return false;
    }
    setEmailError('');
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError('');
    if (!validateEmail(email)) return;

    setIsLoading(true);
    try {
      await apiClient.post('/auth/forgot-password', { email }, { skipAuth: true });
      // The backend always returns success to prevent email enumeration
      setIsSubmitted(true);
    } catch (err) {
      // Unexpected errors (network, server crash) — show the backend message if present
      const detail =
        err instanceof ApiClientError
          ? err.detail
          : 'Something went wrong. Please try again.';
      setServerError(detail);
      toast.error(detail);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <UnauthenticatedLayout>
      <Card className="border-slate-200/80 dark:border-slate-800/80 shadow-xl shadow-slate-200/30 dark:shadow-slate-900/30">
        {isSubmitted ? (
          <>
            <CardHeader className="text-center pb-2">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                <CheckCircle2 className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
              </div>
              <CardTitle className="text-xl">Check your email</CardTitle>
              <CardDescription>
                We&apos;ve sent a password reset link to
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-center gap-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 px-4 py-3">
                <Mail className="h-4 w-4 text-slate-400 shrink-0" />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">
                  {email}
                </span>
              </div>
              <p className="text-center text-sm text-slate-500 dark:text-slate-400">
                Didn&apos;t receive the email? Check your spam folder or{' '}
                <button
                  type="button"
                  onClick={() => { setIsSubmitted(false); setEmail(''); setServerError(''); }}
                  className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 font-medium"
                >
                  try a different email
                </button>
              </p>
              <Button
                variant="outline"
                className="w-full h-10 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 font-medium"
                onClick={() => navigate('/login')}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Sign In
              </Button>
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader className="text-center pb-2">
              <CardTitle className="text-xl">Forgot your password?</CardTitle>
              <CardDescription>
                Enter your email and we&apos;ll send you a link to reset your password
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Server error */}
                {serverError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20 px-4 py-3">
                    <p className="text-sm text-red-700 dark:text-red-400">{serverError}</p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="forgot-email">Email address</Label>
                  <Input
                    id="forgot-email"
                    type="email"
                    placeholder="name@firmname.com.ng"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (emailError) validateEmail(e.target.value);
                      setServerError('');
                    }}
                    onBlur={() => validateEmail(email)}
                    className="h-10"
                    autoComplete="email"
                    aria-invalid={!!emailError}
                    aria-describedby={emailError ? 'forgot-email-error' : undefined}
                  />
                  {emailError && (
                    <p id="forgot-email-error" className="text-xs text-red-500 mt-1">
                      {emailError}
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full h-10 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending reset link…</>
                  ) : (
                    'Send Reset Link'
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
          </>
        )}
      </Card>
    </UnauthenticatedLayout>
  );
}

export default ForgotPasswordPage;
