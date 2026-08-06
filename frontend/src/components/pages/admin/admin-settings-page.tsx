// ============================================================================
// Lawmate - Admin Settings Page
// Organisation profile management wired to live API
// PATCH /auth/organisation — update org name
// GET /auth/organisation — load org details
// ============================================================================

'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Settings, Building2, Loader2, Save, Upload, ImageOff } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import { CloudSyncSection } from './cloud-sync-section';

interface OrgDetails {
  id: string;
  name: string;
  slug: string;
  plan: string;
  is_active: boolean;
  created_at: string;
  tin?: string | null;
  vat_reg_no?: string | null;
  logo_url?: string | null;
  address?: string | null;
  phone?: string | null;
  website?: string | null;
}

const LOGO_MAX_BYTES = 5 * 1024 * 1024;

async function uploadOrganisationLogo(file: File): Promise<OrgDetails> {
  const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  const token = localStorage.getItem('lawsuite_access_token');
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${BASE_URL}/auth/organisation/logo`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: formData,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiClientError(response.status, body?.detail || 'Unable to upload logo.');
  }
  return response.json() as Promise<OrgDetails>;
}

export function AdminSettingsPage() {
  const { user, organisation, setOrganisation } = useAuthStore();
  const [orgDetails, setOrgDetails] = useState<OrgDetails | null>(null);
  const [orgName, setOrgName] = useState('');
  const [orgTin, setOrgTin] = useState('');
  const [orgVatRegNo, setOrgVatRegNo] = useState('');
  const [orgAddress, setOrgAddress] = useState('');
  const [orgPhone, setOrgPhone] = useState('');
  const [orgWebsite, setOrgWebsite] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [error, setError] = useState('');
  const logoInputRef = useRef<HTMLInputElement>(null);

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
        setOrgTin(data.tin || '');
        setOrgVatRegNo(data.vat_reg_no || '');
        setOrgAddress(data.address || '');
        setOrgPhone(data.phone || '');
        setOrgWebsite(data.website || '');
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

  const hasChanges =
    orgName.trim() !== (orgDetails?.name ?? organisation?.name ?? '') ||
    orgTin.trim() !== (orgDetails?.tin ?? '') ||
    orgVatRegNo.trim() !== (orgDetails?.vat_reg_no ?? '') ||
    orgAddress.trim() !== (orgDetails?.address ?? '') ||
    orgPhone.trim() !== (orgDetails?.phone ?? '') ||
    orgWebsite.trim() !== (orgDetails?.website ?? '');

  const applyUpdatedOrg = (updated: OrgDetails) => {
    setOrgDetails(updated);
    setOrgName(updated.name);
    setOrgTin(updated.tin || '');
    setOrgVatRegNo(updated.vat_reg_no || '');
    setOrgAddress(updated.address || '');
    setOrgPhone(updated.phone || '');
    setOrgWebsite(updated.website || '');
    // Update the auth store so the sidebar name/logo refresh immediately
    if (organisation) {
      setOrganisation({
        ...organisation,
        name: updated.name,
        logo_url: updated.logo_url ?? undefined,
        address: updated.address ?? undefined,
        phone: updated.phone ?? undefined,
        website: updated.website ?? undefined,
      });
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = orgName.trim();
    if (!trimmed || trimmed.length < 2) {
      setError('Organisation name must be at least 2 characters');
      return;
    }
    if (!hasChanges) {
      toast.info('No changes to save.');
      return;
    }
    setIsSaving(true);
    setError('');
    try {
      const updated = await apiClient.patch<OrgDetails>('/auth/organisation', {
        name: trimmed,
        tin: orgTin.trim() || undefined,
        vat_reg_no: orgVatRegNo.trim() || undefined,
        address: orgAddress.trim() || undefined,
        phone: orgPhone.trim() || undefined,
        website: orgWebsite.trim() || undefined,
      });
      applyUpdatedOrg(updated);
      toast.success('Organisation details updated.');
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.detail : 'Could not save changes.';
      setError(msg);
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;

    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      toast.error('Logo must be a PNG or JPEG image.');
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      toast.error('Logo must be under 5 MB.');
      return;
    }

    setIsUploadingLogo(true);
    try {
      const updated = await uploadOrganisationLogo(file);
      applyUpdatedOrg(updated);
      toast.success('Logo updated.');
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.detail : 'Unable to upload logo.';
      toast.error(msg);
    } finally {
      setIsUploadingLogo(false);
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
              {/* Logo */}
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900">
                  {currentOrg?.logo_url ? (
                    <img src={currentOrg.logo_url} alt="Organisation logo" className="h-full w-full object-contain" />
                  ) : (
                    <ImageOff className="h-6 w-6 text-slate-300" />
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Logo</Label>
                  <div>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/png,image/jpeg"
                      className="hidden"
                      onChange={handleLogoFileChange}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isUploadingLogo}
                      onClick={() => logoInputRef.current?.click()}
                    >
                      {isUploadingLogo ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Upload className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      {currentOrg?.logo_url ? 'Replace Logo' : 'Upload Logo'}
                    </Button>
                  </div>
                  <p className="text-xs text-slate-400">PNG or JPEG, up to 5 MB. Shown in the sidebar and on invoices.</p>
                </div>
              </div>

              <Separator />

              {/* Read-only info */}
              <div className="grid grid-cols-1 gap-4 rounded-lg bg-slate-50 p-4 dark:bg-slate-900 sm:grid-cols-2">
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

              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Contact Details</Label>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="org-address">Address</Label>
                    <Textarea
                      id="org-address"
                      value={orgAddress}
                      onChange={(e) => setOrgAddress(e.target.value)}
                      placeholder="e.g. 12 Broad Street, Lagos Island, Lagos"
                      rows={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="org-phone">Phone</Label>
                    <Input
                      id="org-phone"
                      value={orgPhone}
                      onChange={(e) => setOrgPhone(e.target.value)}
                      placeholder="+234 1 234 5678"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="org-website">Website</Label>
                    <Input
                      id="org-website"
                      value={orgWebsite}
                      onChange={(e) => setOrgWebsite(e.target.value)}
                      placeholder="https://yourfirm.ng"
                    />
                  </div>
                </div>
                <p className="text-xs text-slate-400">Shown on invoice and report letterheads.</p>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Invoicing</Label>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="org-tin">Tax Identification Number (TIN)</Label>
                    <Input
                      id="org-tin"
                      value={orgTin}
                      onChange={(e) => setOrgTin(e.target.value)}
                      placeholder="e.g. 01234567-0001"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="org-vat-reg-no">VAT Registration Number</Label>
                    <Input
                      id="org-vat-reg-no"
                      value={orgVatRegNo}
                      onChange={(e) => setOrgVatRegNo(e.target.value)}
                    />
                  </div>
                </div>
                <p className="text-xs text-slate-400">Printed on the header of every invoice PDF.</p>
              </div>

              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={isSaving || !hasChanges}
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

      <CloudSyncSection />

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
          <div className="flex flex-col gap-3 rounded-lg border border-red-100 p-4 dark:border-red-900/30 sm:flex-row sm:items-center sm:justify-between">
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
