// ============================================================================
// LegalOps - Admin Settings Page
// Organisation profile management wired to live API
// PATCH /auth/organisation — update org name
// GET /auth/organisation — load org details
// ============================================================================

'use client';

import React, { useEffect, useState } from 'react';
import { Settings, Building2, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/lib/auth-store';
import apiClient, { ApiClientError } from '@/lib/api-client';
import { UserRole } from '@/lib/types';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

interface OrgDetails {
  id: string;
  name: string;
  slug: string;
  plan: string;
  is_active: boolean;
  created_at: string;
}

export function AdminSettingsPage() {
  const { user, organisation, setOrganisation } = useAuthStore();
  const [orgDetails, setOrgDetails] = useState<OrgDetails | null>(null);
  const [orgName, setOrgName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  // Only admins should see this page
  if (user?.role !== UserRole.ADMIN) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Settings className="mb-4 h-12 w-12 text-slate-300" />
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Access Denied</h2>
        <p className="mt-1 text-sm text-slate-500">Only administrators can manage organisation settings.</p>
      </div>
    );
  }

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const data = await apiClient.get<OrgDetails>('/auth/organisation');
        setOrgDetails(data);
        setOrgName(data.name);
      } catch {
        // Use store data as fallback
        if (organisation) {
          setOrgName(organisation.name);
        }
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, [organisation]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = orgName.trim();
    if (!trimmed || trimmed.length < 2) {
      setError('Organisation name must be at least 2 characters');
      return;
    }
    if (trimmed === (orgDetails?.name ?? organisation?.name)) {
      toast.info('No changes to save.');
      return;
    }
    setIsSaving(true);
    setError('');
    try {
      const updated = await apiClient.patch<OrgDetails>('/auth/organisation', { name: trimmed });
      setOrgDetails(updated);
      setOrgName(updated.name);
      // Update the auth store so the sidebar name refreshes
      if (organisation) {
        setOrganisation({ ...organisation, name: updated.name });
      }
      toast.success('Organisation name updated.');
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.detail : 'Could not save changes.';
      setError(msg);
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const currentOrg = orgDetails ?? organisation;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
          Organisation Settings
        </h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Manage your organisation profile and preferences.
        </p>
      </div>

      <Card className="border-slate-200/80 dark:border-slate-700/80">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-slate-500" />
            <CardTitle className="text-base font-semibold">Organisation Profile</CardTitle>
          </div>
          <CardDescription className="text-xs">
            Update your firm&apos;s name and review account details.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-3 py-6">
              <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
              <span className="text-sm text-slate-500">Loading organisation details...</span>
            </div>
          ) : (
            <form onSubmit={handleSave} className="space-y-5">
              {/* Read-only info */}
              <div className="grid grid-cols-2 gap-4 rounded-lg bg-slate-50 dark:bg-slate-900 p-4">
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">Organisation ID</p>
                  <p className="text-xs font-mono text-slate-700 dark:text-slate-300 break-all">
                    {currentOrg?.id ?? '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">URL Slug</p>
                  <p className="text-xs font-mono text-slate-700 dark:text-slate-300">
                    {currentOrg?.slug ?? '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Current Plan</p>
                  <Badge className="text-xs border-emerald-200 bg-emerald-50 text-emerald-700">
                    {(currentOrg?.plan ?? 'free').charAt(0).toUpperCase() +
                      (currentOrg?.plan ?? 'free').slice(1)}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">Created</p>
                  <p className="text-xs text-slate-700 dark:text-slate-300">
                    {currentOrg?.created_at
                      ? new Date(currentOrg.created_at).toLocaleDateString('en-NG', {
                          day: 'numeric', month: 'long', year: 'numeric',
                        })
                      : '—'}
                  </p>
                </div>
              </div>

              <Separator />

              {/* Editable name */}
              <div className="space-y-2">
                <Label htmlFor="org-name">Organisation / Firm Name</Label>
                <Input
                  id="org-name"
                  type="text"
                  value={orgName}
                  onChange={(e) => {
                    setOrgName(e.target.value);
                    if (error) setError('');
                  }}
                  placeholder="e.g. Adeyemi & Co."
                  className="max-w-md"
                />
                {error && <p className="text-xs text-red-500">{error}</p>}
                <p className="text-xs text-slate-400">
                  This name is displayed across the platform and in reports.
                  The URL slug cannot be changed after creation.
                </p>
              </div>

              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={isSaving || orgName.trim() === (currentOrg?.name ?? '')}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Changes
                    </>
                  )}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-red-100 dark:border-red-900/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-red-700 dark:text-red-400">
            Danger Zone
          </CardTitle>
          <CardDescription className="text-xs">
            These actions cannot be undone. Contact support to delete your organisation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-lg border border-red-100 dark:border-red-900/30 p-4">
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                Delete Organisation
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                Permanently remove this organisation and all its data. Contact support.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400"
              disabled
            >
              Delete (contact support)
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default AdminSettingsPage;
