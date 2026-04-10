// ============================================================================
// LegalOps - Platform Admin Portal
// Operator-level view of all organisations on the platform.
//
// Access: user must be admin of the org whose ID matches
// PLATFORM_ADMIN_ORG_ID on the backend. Otherwise all API calls
// return 403 and this page shows an access-denied state.
// ============================================================================

'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Ban,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Filter,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Search,
  Shield,
  Sliders,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ApiClientError } from '@/lib/api-client';
import {
  activateOrg,
  deactivateOrg,
  extendOrgTrial,
  getPlatformOrg,
  getPlatformStats,
  listPlatformOrgs,
  overrideOrgPlan,
  setOrgFeatureFlags,
  type OrgListParams,
  type PlatformOrgDetail,
  type PlatformOrgSummary,
  type PlatformStats,
} from '@/lib/api/platform-admin';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

// ── Helpers ───────────────────────────────────────────────────────────────────

function planBadge(plan: string, trialActive: boolean) {
  if (trialActive)
    return (
      <Badge className="border-purple-200 bg-purple-50 text-purple-700 text-xs font-semibold">
        Trial
      </Badge>
    );
  const map: Record<string, string> = {
    free: 'border-slate-200 bg-slate-50 text-slate-600',
    pro: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    agency: 'border-amber-200 bg-amber-50 text-amber-700',
  };
  return (
    <Badge className={cn('border text-xs font-semibold', map[plan] ?? map.free)}>
      {plan.charAt(0).toUpperCase() + plan.slice(1)}
    </Badge>
  );
}

function statusDot(isActive: boolean) {
  return (
    <span
      className={cn(
        'inline-block h-2 w-2 rounded-full',
        isActive ? 'bg-emerald-500' : 'bg-slate-300'
      )}
    />
  );
}

function formatDate(str: string) {
  return new Date(str).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function daysUntil(str: string | null): number | null {
  if (!str) return null;
  return Math.ceil((new Date(str).getTime() - Date.now()) / 86_400_000);
}

const FEATURE_KEYS = ['drive_integration', 'reports', 'mfa', 'advanced_tasks', 'api_access'] as const;

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  sub,
  accent,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  sub?: string;
  accent?: string;
}) {
  return (
    <Card className="border-slate-200/80 dark:border-slate-700/80">
      <CardContent className="flex items-center gap-4 p-5">
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', accent || 'bg-emerald-50 dark:bg-emerald-950/30')}>
          <Icon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div>
          <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-50">{value}</p>
          <p className="text-xs text-slate-500">{label}</p>
          {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Org Detail Sheet ──────────────────────────────────────────────────────────

function OrgDetailSheet({
  orgId,
  onClose,
  onRefreshList,
}: {
  orgId: string | null;
  onClose: () => void;
  onRefreshList: () => void;
}) {
  const [detail, setDetail] = useState<PlatformOrgDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Action states
  const [planValue, setPlanValue] = useState<'free' | 'pro' | 'agency'>('free');
  const [planReason, setPlanReason] = useState('');
  const [savingPlan, setSavingPlan] = useState(false);
  const [extendDays, setExtendDays] = useState('14');
  const [extendingTrial, setExtendingTrial] = useState(false);
  const [featureFlags, setFeatureFlags] = useState<Record<string, boolean>>({});
  const [savingFlags, setSavingFlags] = useState(false);
  const [togglingActive, setTogglingActive] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  useEffect(() => {
    if (!orgId) { setDetail(null); return; }
    setIsLoading(true);
    setError('');
    getPlatformOrg(orgId)
      .then((d) => {
        setDetail(d);
        setPlanValue(d.plan as 'free' | 'pro' | 'agency');
        setFeatureFlags(d.feature_flags ?? {});
      })
      .catch((err) => {
        setError(err instanceof ApiClientError ? err.detail : 'Could not load organisation.');
      })
      .finally(() => setIsLoading(false));
  }, [orgId]);

  const handlePlanSave = async () => {
    if (!detail) return;
    setSavingPlan(true);
    try {
      await overrideOrgPlan(detail.id, planValue, planReason || undefined);
      toast.success(`Plan set to ${planValue}`);
      setDetail((d) => d ? { ...d, plan: planValue } : d);
      setPlanReason('');
      onRefreshList();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.detail : 'Could not update plan.');
    } finally {
      setSavingPlan(false);
    }
  };

  const handleExtendTrial = async () => {
    if (!detail) return;
    const days = parseInt(extendDays, 10);
    if (!days || days < 1) { toast.error('Enter a valid number of days.'); return; }
    setExtendingTrial(true);
    try {
      const result = await extendOrgTrial(detail.id, days);
      toast.success(`Trial extended by ${days} days`);
      setDetail((d) => d ? { ...d, trial_active: true, trial_ends_at: result.trial_ends_at } : d);
      onRefreshList();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.detail : 'Could not extend trial.');
    } finally {
      setExtendingTrial(false);
    }
  };

  const handleFlagsSave = async () => {
    if (!detail) return;
    setSavingFlags(true);
    try {
      const result = await setOrgFeatureFlags(detail.id, featureFlags);
      toast.success('Feature flags updated');
      setDetail((d) => d ? { ...d, feature_flags: featureFlags } : d);
      // Show effective result
      const on = Object.entries(result.effective_features).filter(([, v]) => v).map(([k]) => k);
      if (on.length) toast.info(`Active overrides: ${on.join(', ')}`);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.detail : 'Could not update flags.');
    } finally {
      setSavingFlags(false);
    }
  };

  const handleToggleActive = async () => {
    if (!detail) return;
    setTogglingActive(true);
    try {
      if (detail.is_active) {
        await deactivateOrg(detail.id);
        toast.success(`${detail.name} suspended`);
        setDetail((d) => d ? { ...d, is_active: false } : d);
      } else {
        await activateOrg(detail.id);
        toast.success(`${detail.name} reactivated`);
        setDetail((d) => d ? { ...d, is_active: true } : d);
      }
      onRefreshList();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.detail : 'Could not update status.');
    } finally {
      setTogglingActive(false);
      setConfirmDeactivate(false);
    }
  };

  const trialDays = detail ? daysUntil(detail.trial_ends_at) : null;

  return (
    <>
      <Sheet open={!!orgId} onOpenChange={(o) => !o && onClose()}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader className="pb-4">
            <SheetTitle>Organisation Detail</SheetTitle>
            <SheetDescription>
              View and manage this tenant&apos;s plan, features, and status.
            </SheetDescription>
          </SheetHeader>

          {isLoading ? (
            <div className="flex items-center gap-3 py-12 justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
              <span className="text-sm text-slate-500">Loading organisation...</span>
            </div>
          ) : error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          ) : detail ? (
            <div className="space-y-6 pt-2">

              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">{detail.name}</h2>
                    {planBadge(detail.plan, detail.trial_active)}
                    <Badge variant="outline" className={cn('text-xs', detail.is_active ? 'border-emerald-200 text-emerald-700' : 'border-red-200 text-red-600')}>
                      {detail.is_active ? 'Active' : 'Suspended'}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    <span className="font-mono">{detail.slug}</span> · Created {formatDate(detail.created_at)}
                  </p>
                </div>
              </div>

              {/* Usage row */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Members', value: detail.usage.member_count },
                  { label: 'Matters', value: detail.usage.matter_count },
                  { label: 'Reports', value: detail.usage.report_count },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-lg bg-slate-50 dark:bg-slate-900 p-3 text-center">
                    <p className="text-xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">{value}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{label}</p>
                  </div>
                ))}
              </div>

              {/* Trial status */}
              {detail.trial_active && trialDays !== null && (
                <div className={cn(
                  'flex items-center gap-3 rounded-lg border px-4 py-3',
                  trialDays <= 3
                    ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20'
                    : 'border-purple-200 bg-purple-50 dark:border-purple-800 dark:bg-purple-950/20'
                )}>
                  <Clock className="h-4 w-4 text-purple-600 shrink-0" />
                  <p className="text-sm text-purple-800 dark:text-purple-300">
                    Trial ends in <strong>{trialDays} {trialDays === 1 ? 'day' : 'days'}</strong> ({formatDate(detail.trial_ends_at!)})
                  </p>
                </div>
              )}

              <Separator />

              {/* Plan override */}
              <div className="space-y-3">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Override Plan</p>
                <div className="flex gap-2">
                  <Select value={planValue} onValueChange={(v) => setPlanValue(v as 'free' | 'pro' | 'agency')}>
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="free">Free</SelectItem>
                      <SelectItem value="pro">Pro</SelectItem>
                      <SelectItem value="agency">Agency</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Reason (optional)"
                    value={planReason}
                    onChange={(e) => setPlanReason(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    onClick={() => void handlePlanSave()}
                    disabled={savingPlan || planValue === detail.plan}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
                  >
                    {savingPlan ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply'}
                  </Button>
                </div>
                {planValue !== detail.plan && (
                  <p className="text-xs text-amber-600">
                    Current: <strong>{detail.plan}</strong> → New: <strong>{planValue}</strong>
                    {planValue !== 'free' && ' (will end trial)'}
                  </p>
                )}
              </div>

              {/* Extend trial */}
              <div className="space-y-3">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Extend Trial</p>
                <div className="flex gap-2 items-center">
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={extendDays}
                    onChange={(e) => setExtendDays(e.target.value)}
                    className="w-24"
                  />
                  <span className="text-sm text-slate-500">days</span>
                  <Button
                    variant="outline"
                    onClick={() => void handleExtendTrial()}
                    disabled={extendingTrial}
                  >
                    {extendingTrial ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Extend'}
                  </Button>
                </div>
                <p className="text-xs text-slate-400">
                  Adds days from today or the current trial end date, whichever is later.
                  Also re-opens an expired trial.
                </p>
              </div>

              <Separator />

              {/* Feature flag overrides */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Feature Flag Overrides</p>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs text-slate-400 h-7"
                    onClick={() => setFeatureFlags({})}
                    disabled={Object.keys(featureFlags).length === 0}
                  >
                    Clear all
                  </Button>
                </div>
                <p className="text-xs text-slate-400">
                  Overrides layer on top of the plan. Unset flags use plan defaults.
                </p>
                <div className="space-y-2">
                  {FEATURE_KEYS.map((key) => {
                    const isSet = key in featureFlags;
                    const val = featureFlags[key];
                    return (
                      <div key={key} className="flex items-center justify-between rounded-lg border border-slate-100 dark:border-slate-800 px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-slate-600 dark:text-slate-400">{key}</span>
                          {!isSet && (
                            <Badge className="border-slate-200 bg-slate-50 text-slate-400 text-[10px]">plan default</Badge>
                          )}
                          {isSet && (
                            <Badge className={cn('text-[10px]', val ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-600')}>
                              forced {val ? 'ON' : 'OFF'}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            className={cn('rounded px-2 py-0.5 text-xs font-medium transition-colors', isSet && val ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200')}
                            onClick={() => setFeatureFlags((f) => ({ ...f, [key]: true }))}
                          >On</button>
                          <button
                            className={cn('rounded px-2 py-0.5 text-xs font-medium transition-colors', isSet && !val ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200')}
                            onClick={() => setFeatureFlags((f) => ({ ...f, [key]: false }))}
                          >Off</button>
                          {isSet && (
                            <button
                              className="rounded px-1.5 py-0.5 text-xs text-slate-400 hover:text-slate-600"
                              onClick={() => setFeatureFlags((f) => { const n = { ...f }; delete n[key]; return n; })}
                            ><X className="h-3 w-3" /></button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <Button
                  size="sm"
                  onClick={() => void handleFlagsSave()}
                  disabled={savingFlags}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {savingFlags ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sliders className="h-3.5 w-3.5 mr-2" />}
                  Save Feature Flags
                </Button>
              </div>

              <Separator />

              {/* Members */}
              <div className="space-y-3">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Members ({detail.members.length})
                </p>
                <div className="space-y-2">
                  {detail.members.map((m) => (
                    <div key={m.id} className="flex items-center gap-3 rounded-lg border border-slate-100 dark:border-slate-800 px-3 py-2">
                      <Avatar className="h-7 w-7 shrink-0">
                        <AvatarFallback className="text-[10px] font-bold bg-emerald-100 text-emerald-700">
                          {m.full_name.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{m.full_name}</p>
                        <p className="text-xs text-slate-400 truncate">{m.email}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge variant="outline" className="text-[10px]">{m.role}</Badge>
                        {m.mfa_enabled && (
                          <span title="MFA enabled">
                            <Shield className="h-3 w-3 text-emerald-600" />
                          </span>
                        )}
                        {m.google_oauth_linked && (
                          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                          </svg>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Danger: activate / deactivate */}
              <div className="space-y-3">
                <p className="text-sm font-semibold text-red-600 dark:text-red-400">Danger Zone</p>
                {detail.is_active ? (
                  <div className="flex items-center justify-between rounded-lg border border-red-100 dark:border-red-900/30 p-4">
                    <div>
                      <p className="text-sm font-medium">Suspend Organisation</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Blocks all logins for members of this org immediately.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-red-200 text-red-600 hover:bg-red-50 shrink-0"
                      onClick={() => setConfirmDeactivate(true)}
                      disabled={togglingActive}
                    >
                      <Ban className="h-3.5 w-3.5 mr-1.5" />
                      Suspend
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between rounded-lg border border-emerald-100 dark:border-emerald-900/30 p-4">
                    <div>
                      <p className="text-sm font-medium">Reactivate Organisation</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Restore access for all members of this org.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
                      onClick={() => void handleToggleActive()}
                      disabled={togglingActive}
                    >
                      {togglingActive ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}
                      Reactivate
                    </Button>
                  </div>
                )}
              </div>

            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* Confirm deactivate dialog */}
      <AlertDialog open={confirmDeactivate} onOpenChange={setConfirmDeactivate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Suspend {detail?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              All {detail?.usage.member_count} members will be immediately blocked from logging in.
              You can reactivate the organisation at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => void handleToggleActive()}
            >
              {togglingActive ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Suspend'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function PlatformAdminPage() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [orgs, setOrgs] = useState<PlatformOrgSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('all');
  const [trialFilter, setTrialFilter] = useState('all');
  const [page, setPage] = useState(1);

  // Detail sheet
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);

  const buildParams = useCallback((): OrgListParams => {
    const p: OrgListParams = { page, page_size: 25 };
    if (search.trim()) p.search = search.trim();
    if (planFilter !== 'all') p.plan = planFilter;
    if (trialFilter === 'active') p.trial_active = true;
    if (trialFilter === 'inactive') p.trial_active = false;
    return p;
  }, [search, planFilter, trialFilter, page]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    else setIsRefreshing(true);

    try {
      const [statsResult, orgsResult] = await Promise.all([
        stats ? Promise.resolve(stats) : getPlatformStats(),
        listPlatformOrgs(buildParams()),
      ]);
      if (!stats) setStats(statsResult as PlatformStats);
      setOrgs(orgsResult.items);
      setTotal(orgsResult.total);
      setPages(orgsResult.pages);
      setAccessDenied(false);
    } catch (err) {
      if (err instanceof ApiClientError && (err.status === 403 || err.status === 401)) {
        setAccessDenied(true);
      } else {
        toast.error('Could not load platform data.');
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [buildParams, stats]);

  // Reload orgs (not stats) when filters change
  const loadOrgs = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    else setIsRefreshing(true);
    try {
      const result = await listPlatformOrgs(buildParams());
      setOrgs(result.items);
      setTotal(result.total);
      setPages(result.pages);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 403) {
        setAccessDenied(true);
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [buildParams]);

  // Initial load
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Filter-driven reload
  useEffect(() => {
    if (!isLoading) void loadOrgs(true);
  }, [search, planFilter, trialFilter, page]); // eslint-disable-line react-hooks/exhaustive-deps

  if (accessDenied) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 dark:bg-red-950/20">
          <Shield className="h-8 w-8 text-red-500" />
        </div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
          Platform Admin Access Required
        </h2>
        <p className="mt-1 max-w-sm text-sm text-slate-500">
          Your organisation is not configured as the platform admin org.
          Set <code className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">PLATFORM_ADMIN_ORG_ID</code> in the backend <code className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">.env</code> to your org&apos;s UUID.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50 flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-emerald-600" />
            Platform Admin
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Operator-level view of all organisations on LegalOps.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void load(true)}
          disabled={isRefreshing}
        >
          <RefreshCw className={cn('h-4 w-4 mr-2', isRefreshing && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Total Orgs" value={stats.organisations.total} icon={Building2} />
          <StatCard label="Active Orgs" value={stats.organisations.active} icon={CheckCircle2} accent="bg-emerald-50 dark:bg-emerald-950/30" />
          <StatCard label="In Trial" value={stats.organisations.in_trial} icon={Clock} accent="bg-purple-50 dark:bg-purple-950/30" />
          <StatCard label="Active Users" value={stats.users.total_active} icon={Users} />
          <StatCard label="Total Matters" value={stats.matters.total} icon={Activity} />
          <StatCard label="Google Connected" value={stats.integrations.google_connected} icon={ExternalLink} accent="bg-blue-50 dark:bg-blue-950/30" />
        </div>
      )}

      {/* Plan breakdown */}
      {stats && (
        <div className="flex flex-wrap gap-3">
          {Object.entries(stats.organisations.by_plan).map(([plan, count]) => (
            <button
              key={plan}
              onClick={() => { setPlanFilter(planFilter === plan ? 'all' : plan); setPage(1); }}
              className={cn(
                'rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
                planFilter === plan
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700'
              )}
            >
              {plan.charAt(0).toUpperCase() + plan.slice(1)}: {count}
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search by name or slug..."
            className="pl-9"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select value={trialFilter} onValueChange={(v) => { setTrialFilter(v); setPage(1); }}>
          <SelectTrigger className="w-40">
            <Filter className="h-3.5 w-3.5 mr-2 text-slate-400" />
            <SelectValue placeholder="Trial" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All trials</SelectItem>
            <SelectItem value="active">Trial active</SelectItem>
            <SelectItem value="inactive">No trial</SelectItem>
          </SelectContent>
        </Select>
        {(search || planFilter !== 'all' || trialFilter !== 'all') && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setSearch(''); setPlanFilter('all'); setTrialFilter('all'); setPage(1); }}
          >
            <X className="h-4 w-4 mr-1" /> Clear
          </Button>
        )}
      </div>

      {/* Table */}
      <Card className="border-slate-200/80 dark:border-slate-700/80">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center gap-3 justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
              <span className="text-sm text-slate-500">Loading organisations...</span>
            </div>
          ) : orgs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Building2 className="h-10 w-10 text-slate-200 mb-2" />
              <p className="text-sm text-slate-500">No organisations match your filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-100 dark:border-slate-800">
                    <TableHead className="w-[240px]">Organisation</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead className="text-center">Members</TableHead>
                    <TableHead className="text-center">Matters</TableHead>
                    <TableHead>Trial</TableHead>
                    <TableHead>Google</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-[60px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orgs.map((org) => {
                    const trial = daysUntil(org.trial_ends_at);
                    return (
                      <TableRow
                        key={org.id}
                        className="cursor-pointer border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-900/50"
                        onClick={() => setSelectedOrgId(org.id)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {statusDot(org.is_active)}
                            <div>
                              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                {org.name}
                              </p>
                              <p className="text-xs font-mono text-slate-400">{org.slug}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{planBadge(org.plan, org.trial_active)}</TableCell>
                        <TableCell className="text-center tabular-nums text-sm">{org.member_count}</TableCell>
                        <TableCell className="text-center tabular-nums text-sm">{org.matter_count}</TableCell>
                        <TableCell>
                          {org.trial_active && trial !== null ? (
                            <span className={cn('text-xs font-medium', trial <= 3 ? 'text-red-600' : 'text-purple-600')}>
                              {trial}d left
                            </span>
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {org.google_connected ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-slate-500">
                          {formatDate(org.created_at)}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuItem onClick={() => setSelectedOrgId(org.id)}>
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-amber-600"
                                onClick={() => {
                                  setSelectedOrgId(org.id);
                                }}
                              >
                                Override Plan
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>
            Showing {(page - 1) * 25 + 1}–{Math.min(page * 25, total)} of {total} organisations
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="font-medium text-slate-700 dark:text-slate-300">
              {page} / {pages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Detail sheet */}
      <OrgDetailSheet
        orgId={selectedOrgId}
        onClose={() => setSelectedOrgId(null)}
        onRefreshList={() => void loadOrgs(true)}
      />
    </div>
  );
}

export default PlatformAdminPage;
