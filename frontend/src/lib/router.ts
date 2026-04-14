// ============================================================================
// LegalOps - Hash-based SPA Router
// Simple client-side router using window.location.hash
// ============================================================================

'use client';

import { useCallback, useEffect, useState, useMemo } from 'react';

// ============================================================================
// Route Definitions
// ============================================================================

export interface RouteDefinition {
  path: string;
  pattern: RegExp;
  name: string;
  icon?: string;
  parent?: string;
}

export const AUTH_ROUTES: RouteDefinition[] = [
  { path: '/login', pattern: /^\/login(\/?$|\?)/, name: 'Sign In' },
  { path: '/register', pattern: /^\/register(\/?$|\?)/, name: 'Create Account' },
  { path: '/forgot-password', pattern: /^\/forgot-password(\/?$|\?)/, name: 'Forgot Password' },
  { path: '/reset-password', pattern: /^\/reset-password(\/?$|\?)/, name: 'Reset Password' },
  { path: '/accept-invite', pattern: /^\/accept-invite(\/?$|\?)/, name: 'Accept Invitation' },
  { path: '/onboarding', pattern: /^\/onboarding(\/?$|\?)/, name: 'Onboarding' },
];

export const ROUTES: RouteDefinition[] = [
  { path: '/', pattern: /^\/?$/, name: 'Dashboard', icon: 'home' },
  { path: '/clients', pattern: /^\/clients\/?$/, name: 'Clients', icon: 'users', parent: '/' },
  { path: '/clients/new', pattern: /^\/clients\/new\/?$/, name: 'New Client', parent: '/clients' },
  { path: '/clients/:id', pattern: /^\/clients\/([^/]+)\/?$/, name: 'Client Details', parent: '/clients' },
  { path: '/clients/:id/edit', pattern: /^\/clients\/([^/]+)\/edit\/?$/, name: 'Edit Client', parent: '/clients' },
  { path: '/matters', pattern: /^\/matters\/?$/, name: 'Matters', icon: 'briefcase', parent: '/' },
  { path: '/matters/new', pattern: /^\/matters\/new\/?$/, name: 'New Matter', parent: '/matters' },
  { path: '/matters/:id', pattern: /^\/matters\/([^/]+)\/?$/, name: 'Matter Details', parent: '/matters' },
  { path: '/matters/:id/edit', pattern: /^\/matters\/([^/]+)\/edit\/?$/, name: 'Edit Matter', parent: '/matters' },
  { path: '/calendar', pattern: /^\/calendar\/?$/, name: 'Calendar', icon: 'calendar', parent: '/' },
  { path: '/notes', pattern: /^\/notes\/?$/, name: 'Notes', icon: 'notebook', parent: '/' },
  { path: '/tasks', pattern: /^\/tasks\/?$/, name: 'Tasks', icon: 'check-square', parent: '/' },
  { path: '/documents', pattern: /^\/documents\/?$/, name: 'Documents', icon: 'file-text', parent: '/' },
  { path: '/reports', pattern: /^\/reports\/?$/, name: 'Reports', icon: 'bar-chart', parent: '/' },
  { path: '/admin/team', pattern: /^\/admin\/team\/?$/, name: 'Team Management', parent: '/' },
  { path: '/admin/integrations', pattern: /^\/admin\/integrations\/?$/, name: 'Integrations', parent: '/' },
  { path: '/admin/billing', pattern: /^\/admin\/billing\/?$/, name: 'Billing', parent: '/' },
  { path: '/settings', pattern: /^\/settings\/?$/, name: 'Settings', icon: 'settings', parent: '/' },
];

// ============================================================================
// Navigation
// ============================================================================

export function navigate(path: string): void {
  // Use replaceState-style by just setting hash
  window.location.hash = `#${path}`;
}

export function replaceNavigation(path: string): void {
  const url = new URL(window.location.href);
  url.hash = `#${path}`;
  window.history.replaceState(null, '', url.toString());
}

// ============================================================================
// Route Parsing
// ============================================================================

function getHashPath(): string {
  if (typeof window === 'undefined') return '/';
  const hash = window.location.hash;
  const pathname = window.location.pathname;

  // If we have a hash, it takes precedence (SPA mode)
  if (hash) {
    const path = hash.replace(/^#\/?/, '/');
    return path === '' ? '/' : path;
  }

  // Fallback to pathname if no hash is present (e.g. initial server redirect)
  return pathname === '' ? '/' : pathname;
}

export function getRouteParams(): Record<string, string> {
  const path = getHashPath();

  for (const route of ROUTES) {
    const match = path.match(route.pattern);
    if (match) {
      // Extract named params from pattern
      const paramNames = (route.path.match(/:(\w+)/g) || []).map((p) => p.slice(1));
      const params: Record<string, string> = {};
      paramNames.forEach((name, index) => {
        params[name] = match[index + 1];
      });
      return params;
    }
  }

  return {};
}

export function matchRoute(path: string): RouteDefinition | undefined {
  // Check auth routes first
  for (const route of AUTH_ROUTES) {
    if (route.pattern.test(path)) {
      return route;
    }
  }
  // Then app routes
  for (const route of ROUTES) {
    if (route.pattern.test(path)) {
      return route;
    }
  }
  return undefined;
}

export function getBreadcrumbSegments(path: string): { name: string; path: string }[] {
  const segments: { name: string; path: string }[] = [];

  const route = matchRoute(path);
  if (route) {
    // Add parent segments
    if (route.parent && route.parent !== '/') {
      const parentRoute = matchRoute(route.parent);
      if (parentRoute) {
        segments.push({ name: parentRoute.name, path: parentRoute.path });
      }
    }

    // Add current route (with param substitution)
    const params = getRouteParams();
    let displayName = route.name;
    Object.entries(params).forEach(([key, value]) => {
      displayName = displayName.replace(`:${key}`, value);
    });
    segments.push({ name: displayName, path });
  } else {
    segments.push({ name: 'Page Not Found', path });
  }

  return segments;
}

// ============================================================================
// React Hooks
// ============================================================================

export function useCurrentRoute(): string {
  // Always start with '/' so SSR and the initial client render agree.
  // getHashPath() is only safe to call after mount (window is available).
  const [route, setRoute] = useState<string>('/');

  useEffect(() => {
    // Sync to the real hash path after first mount (fixes hydration mismatch).
    setRoute(getHashPath());

    const handleHashChange = () => {
      setRoute(getHashPath());
    };

    window.addEventListener('hashchange', handleHashChange);
    window.addEventListener('popstate', handleHashChange);

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      window.removeEventListener('popstate', handleHashChange);
    };
  }, []);

  return route;
}

export function useRouteParams(): Record<string, string> {
  const route = useCurrentRoute();
  return useMemo(() => getRouteParams(), [route]);
}

export function useMatchedRoute(): RouteDefinition | undefined {
  const route = useCurrentRoute();
  return useMemo(() => matchRoute(route), [route]);
}

export function useNavigate() {
  const navigateFn = useCallback((path: string) => {
    navigate(path);
  }, []);

  return navigateFn;
}

export function useIsActiveRoute(path: string, exact = false): boolean {
  const currentRoute = useCurrentRoute();

  return useMemo(() => {
    if (exact) {
      return currentRoute === path || currentRoute === path + '/';
    }
    // Partial match: current route starts with path
    const normalized = path.endsWith('/') ? path : path + '/';
    return currentRoute === path || currentRoute.startsWith(normalized);
  }, [currentRoute, path, exact]);
}

export function isAuthRoute(path: string): boolean {
  return AUTH_ROUTES.some((route) => route.pattern.test(path));
}

const router = {
  navigate,
  replaceNavigation,
  useCurrentRoute,
  useRouteParams,
  useMatchedRoute,
  useNavigate,
  useIsActiveRoute,
  getRouteParams,
  matchRoute,
  getBreadcrumbSegments,
  isAuthRoute,
  ROUTES,
  AUTH_ROUTES,
};

export default router;
