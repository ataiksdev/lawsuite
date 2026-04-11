// ============================================================================
// LegalOps - Onboarding Page
// For new Google OAuth users who need to name their organisation
// ============================================================================

'use client';

import React, { useEffect, useState } from 'react';
import { Loader2, Building2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { UnauthenticatedLayout } from './unauthenticated-layout';
import { useAuthStore } from '@/lib/auth-store';
import { navigate } from '@/lib/router';
import apiClient, { ApiClientError } from '@/lib/api-client';

interface BackendAuthUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  is_verified: boolean;
  created_at: string;
}

interface BackendAuthOrganisation {
  id: string;
  name: string;
  slug: string;
  plan: 'free' | 'pro' | 'agency';
  is_active: boolean;
  created_at: string;
}

interface CompleteSignupResponse {
  user: BackendAuthUser;
  organisation: BackendAuthOrganisation;
  tokens: {
    access_token: string;
    refresh_token: string;
    token_type: string;
    expires_in: number;
  };
}

export function OnboardingPage() {
  const [provisionalToken, setProvisionalToken] = useState('');
  const [orgName, setOrgName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Extract provisional token from URL on mount
  useEffect(() => {
    const hash = window.location.hash;
    const hashParams = new URLSearchParams(hash.includes('?') ? hash.split('?')[1] : '');
    const standardParams = new URLSearchParams(window.location.search);
    
    const token = hashParams.get('provisional') || standardParams.get('provisional');
    
    if (token) {
      setProvisionalToken(token);
    } else {
      toast.error('Invalid onboarding link. Please sign in again.');
      navigate('/login');
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = orgName.trim();
    if (!trimmed || trimmed.length < 2) {
      setError('Organisation name must be at least 2 characters');
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      const response = await apiClient.post<CompleteSignupResponse>(
        '/auth/google/complete-signup',
        { provisional_token: provisionalToken, org_name: trimmed },
        { skipAuth: true }
      );

      // Store tokens and load into auth store
      apiClient.setTokens(response.tokens.access_token, response.tokens.refresh_token);
      await useAuthStore.getState().refreshAuth();

      toast.success(`Welcome to LegalOps! "${trimmed}" is all set.`, {
        description: 'Your 30-day free trial has started. You have full access to all features.',
      });
      navigate('/');
    } catch (err) {
      const message = err instanceof ApiClientError ? err.detail : 'Could not complete setup. Please try again.';
      setError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!provisionalToken) {
    return (
      <UnauthenticatedLayout>
        <Card className="border-slate-200/80 shadow-xl">
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
          </CardContent>
        </Card>
      </UnauthenticatedLayout>
    );
  }

  return (
    <UnauthenticatedLayout>
      <Card className="border-slate-200/80 dark:border-slate-800/80 shadow-xl shadow-slate-200/30 dark:shadow-slate-900/30">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-3">
            <div className="h-12 w-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <Building2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            </div>
          </div>
          <CardTitle className="text-xl">Almost there!</CardTitle>
          <CardDescription>
            Give your law firm a name to finish setting up your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="org-name">Organisation / Firm Name</Label>
              <Input
                id="org-name"
                type="text"
                placeholder="e.g. Adeyemi & Co."
                value={orgName}
                onChange={(e) => {
                  setOrgName(e.target.value);
                  if (error) setError('');
                }}
                className="h-10"
                autoComplete="organization"
                autoFocus
              />
              {error && <p className="text-xs text-red-500">{error}</p>}
            </div>

            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 px-4 py-3 text-xs text-emerald-800 dark:text-emerald-300">
              🎉 Your account comes with a <strong>30-day free trial</strong> — full access to all Pro features, no credit card required.
            </div>

            <Button
              type="submit"
              className="w-full h-10 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
              disabled={isSubmitting || orgName.trim().length < 2}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Setting up...
                </>
              ) : (
                <>
                  Create my workspace
                  <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </UnauthenticatedLayout>
  );
}

export default OnboardingPage;
