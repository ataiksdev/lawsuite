// ============================================================================
// LegalOps - Login Page
// Handles email/password login with MFA second-factor step
// ============================================================================

'use client';

import React, { useState } from 'react';
import { Eye, EyeOff, Loader2, FlaskConical, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { UnauthenticatedLayout } from './unauthenticated-layout';
import { useAuthStore } from '@/lib/auth-store';
import { navigate } from '@/lib/router';
import { mockUsers, mockOrganisation } from '@/lib/mock-data';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const DEMO_MODE_ENABLED = process.env.NEXT_PUBLIC_ENABLE_DEMO_MODE === 'true';

// ============================================================================
// MFA Step Component
// ============================================================================

function MfaStep() {
  const { completeMfaLogin, isLoading, error } = useAuthStore();
  const [code, setCode] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    try {
      await completeMfaLogin(code.trim());
      navigate('/');
    } catch {
      // error shown by store
    }
  };

  return (
    <Card className="border-slate-200/80 dark:border-slate-800/80 shadow-xl shadow-slate-200/30 dark:shadow-slate-900/30">
      <CardHeader className="text-center pb-2">
        <div className="flex justify-center mb-3">
          <div className="h-12 w-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
            <ShieldCheck className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          </div>
        </div>
        <CardTitle className="text-xl">Two-Factor Authentication</CardTitle>
        <CardDescription>
          Enter the 6-digit code from your authenticator app, or use a backup code.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="mfa-code">Verification Code</Label>
            <Input
              id="mfa-code"
              type="text"
              inputMode="numeric"
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
              className="h-12 text-center text-2xl tracking-widest font-mono"
              autoComplete="one-time-code"
              autoFocus
            />
            {error && (
              <p className="text-xs text-red-500">{error}</p>
            )}
          </div>

          <Button
            type="submit"
            className="w-full h-10 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
            disabled={isLoading || code.length < 6}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Verifying...
              </>
            ) : (
              'Verify & Sign In'
            )}
          </Button>

          <p className="text-center text-xs text-slate-500 dark:text-slate-400">
            Can&apos;t access your authenticator?{' '}
            <span className="text-emerald-600 dark:text-emerald-400">Use a backup code above.</span>
          </p>

          <button
            type="button"
            className="w-full text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-center"
            onClick={() => useAuthStore.setState({ mfaPending: false, mfaToken: null })}
          >
            ← Back to sign in
          </button>
        </form>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Main Login Page
// ============================================================================

export function LoginPage() {
  const { login, isLoading, mfaPending } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [isDemoLoading, setIsDemoLoading] = useState(false);

  // If MFA is pending, show the MFA step instead
  if (mfaPending) {
    return (
      <UnauthenticatedLayout>
        <MfaStep />
      </UnauthenticatedLayout>
    );
  }

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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    const isEmailValid = validateEmail(email);
    if (!isEmailValid || !password.trim()) {
      if (!password.trim()) {
        toast.error('Please enter your password');
      }
      return;
    }

    try {
      const { mfaRequired } = await login(email, password);
      if (!mfaRequired) {
        navigate('/');
      }
      // If mfaRequired, the store sets mfaPending=true and the component re-renders to MfaStep
    } catch {
      // Error toast is already shown by the auth store
    }
  };

  const handleDemoMode = async () => {
    setIsDemoLoading(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 600));

      const mockUser = mockUsers[0];
      useAuthStore.setState({
        user: mockUser,
        organisation: mockOrganisation,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });

      toast.success(`Welcome, ${mockUser.first_name}! Demo mode activated.`, {
        description: 'You are logged in as Administrator with full access.',
      });
      navigate('/');
    } catch {
      toast.error('Failed to activate demo mode. Please try again.');
    } finally {
      setIsDemoLoading(false);
    }
  };

  return (
    <UnauthenticatedLayout>
      <Card className="border-slate-200/80 dark:border-slate-800/80 shadow-xl shadow-slate-200/30 dark:shadow-slate-900/30">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-xl">Welcome back</CardTitle>
          <CardDescription>
            Sign in to your LegalOps account to continue
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            {/* Email Field */}
            <div className="space-y-2">
              <Label htmlFor="login-email">Email address</Label>
              <Input
                id="login-email"
                type="email"
                placeholder="name@firmname.com.ng"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailError) validateEmail(e.target.value);
                }}
                onBlur={() => validateEmail(email)}
                className="h-10"
                autoComplete="email"
                aria-invalid={!!emailError}
                aria-describedby={emailError ? 'email-error' : undefined}
              />
              {emailError && (
                <p id="email-error" className="text-xs text-red-500 mt-1">
                  {emailError}
                </p>
              )}
            </div>

            {/* Password Field */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="login-password">Password</Label>
                <button
                  type="button"
                  onClick={() => navigate('/forgot-password')}
                  className="text-xs text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 font-medium"
                >
                  Forgot Password?
                </button>
              </div>
              <div className="relative">
                <Input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-10 pr-10"
                  autoComplete="current-password"
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
            </div>

            {/* Sign In Button */}
            <Button
              type="submit"
              className="w-full h-10 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </Button>

            {/* Google Sign-In */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-slate-200 dark:border-slate-700" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white dark:bg-slate-950 px-2 text-slate-400">or</span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full h-10 border-slate-200 dark:border-slate-700 font-medium"
              onClick={() => { window.location.href = `${BACKEND_URL}/auth/google/login`; }}
            >
              <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </Button>

            {DEMO_MODE_ENABLED && (
              <>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-slate-200 dark:border-slate-700" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white dark:bg-slate-950 px-2 text-slate-400">or</span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-10 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 font-medium"
                  disabled={isDemoLoading}
                  onClick={handleDemoMode}
                >
                  {isDemoLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Loading demo...
                    </>
                  ) : (
                    <>
                      <FlaskConical className="h-4 w-4 mr-2" />
                      Demo Mode
                    </>
                  )}
                </Button>
              </>
            )}
          </form>

          <p className="text-center text-sm text-slate-500 dark:text-slate-400 mt-6">
            Don&apos;t have an account?{' '}
            <button
              type="button"
              onClick={() => navigate('/register')}
              className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 font-medium"
            >
              Create one now
            </button>
          </p>
        </CardContent>
      </Card>
    </UnauthenticatedLayout>
  );
}

export default LoginPage;
