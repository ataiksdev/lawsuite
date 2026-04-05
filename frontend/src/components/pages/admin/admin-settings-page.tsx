'use client';

import React, { useState } from 'react';
import {
  Settings as SettingsIcon,
  Shield,
  Trash2,
  AlertTriangle,
  Lock,
  Clock,
  Info,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/lib/auth-store';
import { UserRole } from '@/lib/types';
import { mockOrganisation } from '@/lib/mock-data';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

// ============================================================================
// Admin Settings Page
// ============================================================================

export function AdminSettingsPage() {
  const { user } = useAuthStore();
  const [orgName, setOrgName] = useState(mockOrganisation.name);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [sessionTimeout, setSessionTimeout] = useState('30');

  if (user?.role !== UserRole.ADMIN) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Shield className="h-12 w-12 text-slate-300 mb-4" />
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Access Denied</h2>
        <p className="text-sm text-slate-500 mt-1">Only administrators can access these settings.</p>
      </div>
    );
  }

  const handleSaveOrgName = () => {
    toast.success('Organisation name updated', { description: `Changed to "${orgName}".` });
  };

  const handleDeleteOrganisation = () => {
    toast.success('Organisation deletion requested', { description: 'A confirmation email has been sent. This action will be processed within 30 days.' });
  };

  const getPlanBadge = () => {
    switch (mockOrganisation.plan) {
      case 'professional':
        return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100 text-xs font-semibold">Professional</Badge>;
      case 'enterprise':
        return <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100 text-xs font-semibold">Enterprise</Badge>;
      case 'starter':
        return <Badge className="bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-100 text-xs font-semibold">Starter</Badge>;
      default:
        return <Badge className="bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-100 text-xs font-semibold">Free</Badge>;
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50 tracking-tight">Admin Settings</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Configure your organisation and security settings.</p>
      </div>

      {/* Organisation Settings */}
      <Card className="border-slate-200/80 dark:border-slate-700/80">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <SettingsIcon className="h-5 w-5 text-slate-500" />
            <CardTitle className="text-base font-semibold">Organisation Settings</CardTitle>
          </div>
          <CardDescription className="text-xs">Manage your organisation details.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="org-name">Organisation Name</Label>
            <div className="flex gap-3">
              <Input id="org-name" value={orgName} onChange={(e) => setOrgName(e.target.value)} className="max-w-sm" />
              <Button size="sm" onClick={handleSaveOrgName} disabled={orgName === mockOrganisation.name} className="bg-emerald-600 hover:bg-emerald-700">
                Save
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="org-slug">Organisation Slug</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-slate-400 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs max-w-[200px]">The slug is used in URLs and cannot be changed. Contact support if you need to update it.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Input id="org-slug" value={mockOrganisation.slug} disabled className="max-w-sm bg-slate-50 dark:bg-slate-900" />
          </div>

          <div className="space-y-2">
            <Label>Current Plan</Label>
            <div className="flex items-center gap-2">
              {getPlanBadge()}
              <span className="text-xs text-slate-500">Billed monthly via Paystack</span>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-slate-500">RC Number</Label>
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100 mt-0.5">{mockOrganisation.rc_number}</p>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Member Count</Label>
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100 mt-0.5">{mockOrganisation.member_count}</p>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Email</Label>
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100 mt-0.5">{mockOrganisation.email}</p>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Created</Label>
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100 mt-0.5">
                {new Date(mockOrganisation.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Security Settings */}
      <Card className="border-slate-200/80 dark:border-slate-700/80">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-slate-500" />
            <CardTitle className="text-base font-semibold">Security Settings</CardTitle>
          </div>
          <CardDescription className="text-xs">Configure security options for your organisation.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Two-Factor Authentication</Label>
              <p className="text-xs text-slate-500">Require all team members to use 2FA when signing in.</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">Coming Soon</Badge>
              <Switch checked={twoFactorEnabled} onCheckedChange={setTwoFactorEnabled} disabled />
            </div>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                Session Timeout
              </Label>
              <p className="text-xs text-slate-500">Automatically sign out inactive users after a period.</p>
            </div>
            <select
              value={sessionTimeout}
              onChange={(e) => {
                setSessionTimeout(e.target.value);
                toast.success('Session timeout updated', { description: `Set to ${e.target.value} minutes.` });
              }}
              className="text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 h-9"
            >
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
              <option value="60">1 hour</option>
              <option value="120">2 hours</option>
              <option value="480">8 hours</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-red-200 dark:border-red-900/40">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <CardTitle className="text-base font-semibold text-red-700 dark:text-red-400">Danger Zone</CardTitle>
          </div>
          <CardDescription className="text-xs">Irreversible and destructive actions.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start justify-between gap-4 p-4 rounded-lg border border-red-200 dark:border-red-900/30 bg-red-50/50 dark:bg-red-950/10">
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-red-700 dark:text-red-400">Delete Organisation</h4>
              <p className="text-xs text-red-600/80 dark:text-red-400/80 max-w-md">
                Permanently delete this organisation and all its data, including matters, documents, tasks, and client information. This action cannot be undone.
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="bg-red-600 text-white hover:bg-red-700 hover:text-white border-red-600 shrink-0">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Organisation
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-red-700 dark:text-red-400">Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription className="space-y-2">
                    <p>This action <strong>cannot be undone</strong>. This will permanently delete:</p>
                    <ul className="list-disc list-inside text-sm space-y-1">
                      <li>All matters and associated documents</li>
                      <li>All client records</li>
                      <li>All task history and activity logs</li>
                      <li>All team member accounts</li>
                      <li>All billing and payment records</li>
                    </ul>
                    <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/20 rounded-lg p-2 mt-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                      <span className="text-sm text-amber-700 dark:text-amber-400">Type <strong>&quot;{mockOrganisation.name}&quot;</strong> to confirm.</span>
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={handleDeleteOrganisation}>
                    Yes, delete organisation
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default AdminSettingsPage;
