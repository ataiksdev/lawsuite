'use client';

import { useEffect } from 'react';

export default function SettingsBillingRedirectPage() {
  useEffect(() => {
    window.location.replace('/#/admin/billing');
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center p-6 text-sm text-slate-500">
      Redirecting to billing...
    </div>
  );
}
