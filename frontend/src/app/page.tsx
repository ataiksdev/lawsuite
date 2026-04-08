'use client';

import React, { useEffect, useRef } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { useCurrentRoute, isAuthRoute, navigate } from '@/lib/router';
import { useAuthStore } from '@/lib/auth-store';
import apiClient from '@/lib/api-client';
import { Scale } from 'lucide-react';

// Auth Pages
import { LoginPage } from '@/components/pages/auth/login-page';
import { RegisterPage } from '@/components/pages/auth/register-page';
import { AcceptInvitePage } from '@/components/pages/auth/accept-invite-page';
import { ForgotPasswordPage } from '@/components/pages/auth/forgot-password-page';
import { OnboardingPage } from '@/components/pages/auth/onboarding-page';

// Dashboard Page
import { DashboardPage } from '@/components/pages/dashboard/dashboard-page';

// Client Pages
import { ClientListPage } from '@/components/pages/clients/client-list-page';
import { ClientFormPage } from '@/components/pages/clients/client-form-page';
import { ClientDetailPage } from '@/components/pages/clients/client-detail-page';

// Matter Pages
import { MatterListPage } from '@/components/pages/matters/matter-list-page';
import { MatterFormPage } from '@/components/pages/matters/matter-form-page';
import { MatterDetailPage } from '@/components/pages/matters/matter-detail-page';

// Admin Pages
import { TeamPage } from '@/components/pages/admin/team-page';
import { IntegrationsPage } from '@/components/pages/admin/integrations-page';
import { BillingPage } from '@/components/pages/admin/billing-page';
import { AdminSettingsPage } from '@/components/pages/admin/admin-settings-page';

// Tasks Page
import { KanbanPage } from '@/components/pages/tasks/kanban-page';

// Reports Page
import { ReportsPage } from '@/components/pages/reports/reports-page';

// Settings Page
import { UserSettingsPage } from '@/components/pages/settings/user-settings-page';

// ============================================================================
// 404 Page Component
// ============================================================================

function NotFoundPage({ route }: { route: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/20 p-6 mb-6">
        <Scale className="h-12 w-12 text-emerald-600 dark:text-emerald-400" />
      </div>
      <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-50 mb-2">
        Page Not Found
      </h2>
      <p className="text-slate-500 dark:text-slate-400 max-w-md mb-6">
        The page at <code className="font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">{route}</code> does not exist.
      </p>
      <button
        onClick={() => navigate('/')}
        className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
      >
        Go to Dashboard
      </button>
    </div>
  );
}

// ============================================================================
// Auth Router — renders the correct auth page based on the current route
// ============================================================================

export const AUTH_ROUTES_EXTRA = [
  '/onboarding',
];

function AuthRouter({ route }: { route: string }) {
  if (route === '/register') return <RegisterPage />;
  if (route === '/forgot-password') return <ForgotPasswordPage />;
  if (route === '/accept-invite') return <AcceptInvitePage />;
  if (route === '/onboarding') return <OnboardingPage />;
  return <LoginPage />;
}

// ============================================================================
// App Router — renders the correct page based on the current route
// ============================================================================

function AppRouter({ route }: { route: string }) {
  // Dashboard
  if (route === '/' || route === '') return <DashboardPage />;

  // Client routes
  if (route === '/clients' || route === '/clients/') return <ClientListPage />;
  if (route === '/clients/new' || route === '/clients/new/') return <ClientFormPage />;
  if (route.match(/^\/clients\/([^/]+)\/edit\/?$/)) return <ClientFormPage />;
  if (route.match(/^\/clients\/([^/]+)\/?$/)) return <ClientDetailPage />;

  // Matter routes
  if (route === '/matters' || route === '/matters/') return <MatterListPage />;
  if (route === '/matters/new' || route === '/matters/new/') return <MatterFormPage />;
  if (route.match(/^\/matters\/([^/]+)\/edit\/?$/)) return <MatterFormPage />;
  if (route.match(/^\/matters\/([^/]+)\/?$/)) return <MatterDetailPage />;

  // Tasks — Kanban board
  if (route === '/tasks' || route === '/tasks/') return <KanbanPage />;

  // Documents (redirects to matters — docs are viewed within matters)
  if (route === '/documents' || route === '/documents/') return <MatterListPage />;

  // Reports
  if (route === '/reports' || route === '/reports/') return <ReportsPage />;

  // Admin routes
  if (route === '/admin/team' || route === '/admin/team/') return <TeamPage />;
  if (route === '/admin/integrations' || route === '/admin/integrations/') return <IntegrationsPage />;
  if (route === '/admin/billing' || route === '/admin/billing/') return <BillingPage />;
  if (route === '/admin/settings' || route === '/admin/settings/') return <AdminSettingsPage />;
  if (route.match(/^\/admin\/?$/)) return <TeamPage />;

  // Settings
  if (route === '/settings' || route === '/settings/') return <UserSettingsPage />;
  if (route === '/settings/integrations' || route === '/settings/integrations/') return <IntegrationsPage />;
  if (route === '/settings/billing' || route === '/settings/billing/') return <BillingPage />;

  // 404
  return <NotFoundPage route={route} />;
}

// ============================================================================
// Main Page — SPA Shell
// ============================================================================

export default function Home() {
  const currentRoute = useCurrentRoute();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hasInitializedRef = useRef(false);

  // Initialize auth from storage on mount
  // Also handle Google OAuth callback: /login?tokens=<base64>
  useEffect(() => {
    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;

      // Handle Google OAuth callback — backend redirects here with base64 tokens
      const hash = window.location.hash;
      const queryString = hash.includes('?') ? hash.split('?')[1] : window.location.search.slice(1);
      const params = new URLSearchParams(queryString);
      const tokensParam = params.get('tokens');

      if (tokensParam && currentRoute === '/login') {
        try {
          const decoded = JSON.parse(atob(tokensParam));
          if (decoded.access_token && decoded.refresh_token) {
            apiClient.setTokens(decoded.access_token, decoded.refresh_token);
            // Clear the tokens from the URL then load auth
            window.history.replaceState(null, '', window.location.pathname + window.location.hash.split('?')[0]);
            useAuthStore.getState().loadFromStorage();
            return;
          }
        } catch {
          // Invalid base64 — fall through to normal flow
        }
      }

      const token = typeof window !== 'undefined'
        ? localStorage.getItem('lawsuite_access_token')
        : null;
      if (token && !useAuthStore.getState().isAuthenticated) {
        useAuthStore.getState().loadFromStorage();
      }
    }
  }, [currentRoute]);

  // If on an auth route or not authenticated, show auth pages
  if (!isAuthenticated || isAuthRoute(currentRoute)) {
    // If authenticated and trying to access auth route, redirect to dashboard
    if (isAuthenticated && isAuthRoute(currentRoute)) {
      setTimeout(() => navigate('/'), 0);
      return null;
    }
    return <AuthRouter route={currentRoute} />;
  }

  return (
    <AppShell>
      <AppRouter route={currentRoute} />
    </AppShell>
  );
}
