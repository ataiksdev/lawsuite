// ============================================================================
// LegalOps - Unauthenticated Layout
// Wrapper layout for all authentication pages
// ============================================================================

'use client';

import React from 'react';
import { Scale } from 'lucide-react';

interface UnauthenticatedLayoutProps {
  children: React.ReactNode;
}

export function UnauthenticatedLayout({ children }: UnauthenticatedLayoutProps) {
  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-teal-50 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950 p-4 overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Gradient orbs */}
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-emerald-200/40 dark:bg-emerald-900/15 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-teal-200/40 dark:bg-teal-900/15 blur-3xl" />
        <div className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full bg-emerald-100/30 dark:bg-emerald-800/10 blur-2xl" />

        {/* Subtle legal-themed pattern (grid of thin lines) */}
        <div
          className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"
          style={{
            backgroundImage: `
              linear-gradient(90deg, #065f46 1px, transparent 1px),
              linear-gradient(#065f46 1px, transparent 1px)
            `,
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      {/* Main content area */}
      <div className="relative z-10 flex flex-col items-center w-full max-w-md">
        {/* Logo / Branding */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/25 mb-4">
            <Scale className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50 tracking-tight">
            LegalOps
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Legal Operations Management Platform
          </p>
        </div>

        {/* Page content (Card) */}
        <div className="w-full">
          {children}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center space-y-1">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            &copy; {new Date().getFullYear()} LegalOps. All rights reserved.
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Built for Nigerian legal practice.
          </p>
        </div>
      </div>
    </div>
  );
}

export default UnauthenticatedLayout;
