// ============================================================================
// LegalOps - Dashboard Page
// Wired to live backend API — replaces mock data
// ============================================================================

'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Briefcase,
  CheckSquare,
  AlertTriangle,
  Users,
  TrendingUp,
  Clock,
  ArrowRight,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/lib/auth-store';
import { navigate } from '@/lib/router';
import apiClient, { ApiClientError } from '@/lib/api-client';

import { listMatters } from '@/lib/api/matters';
import { listOverdueTasks, listMatterTasks } from '@/lib/api/tasks';
import { listMembers } from '@/lib/api/members';
import { listClients } from '@/lib/api/clients';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

// ============================================================================
// Types
// ============================================================================

interface DashboardStats {
  openMatters: number;
  totalMatters: number;
  overdueTasks: number;
  pendingTasks: number;
  totalMembers: number;
  totalClients: number;
}

interface ActivityEntry {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  actor_id: string | null;
  created_at: string;
  matter_id: string;
}

interface OverdueTaskEntry {
  id: string;
  matter_id: string;
  matter_title: string;
  matter_reference_no: string;
  title: string;
  priority: 'low' | 'medium' | 'high';
  due_date: string;
}

// ============================================================================
// Helpers
// ============================================================================

function getPriorityColor(priority: string) {
  switch (priority) {
    case 'high': return 'bg-red-100 text-red-700 border-red-200';
    case 'medium': return 'bg-amber-100 text-amber-700 border-amber-200';
    default: return 'bg-slate-100 text-slate-600 border-slate-200';
  }
}

function formatRelative(dateStr: string): string {
  const now = Date.now();
  const ts = new Date(dateStr).getTime();
  const diff = now - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
}

function formatEventType(type: string): string {
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function getEventColor(type: string): string {
  if (type.includes('created') || type.includes('opened')) return 'bg-emerald-500';
  if (type.includes('closed')) return 'bg-slate-400';
  if (type.includes('document')) return 'bg-blue-500';
  if (type.includes('task')) return 'bg-purple-500';
  if (type.includes('email')) return 'bg-amber-500';
  return 'bg-emerald-400';
}

// ============================================================================
// Stat Card
// ============================================================================

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  iconClass,
  onClick,
  loading,
}: {
  label: string;
  value: number | string;
  sub?: string;
  icon: React.ElementType;
  iconClass?: string;
  onClick?: () => void;
  loading?: boolean;
}) {
  return (
    <Card
      className={cn(
        'border-slate-200/80 dark:border-slate-700/80 transition-all',
        onClick && 'cursor-pointer hover:border-emerald-300 hover:shadow-md dark:hover:border-emerald-700'
      )}
      onClick={onClick}
    >
      <CardContent className="flex items-center gap-4 p-5">
        <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', iconClass || 'bg-emerald-50 dark:bg-emerald-950/30')}>
          <Icon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="min-w-0">
          {loading ? (
            <Skeleton className="h-7 w-16 mb-1" />
          ) : (
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-50 tabular-nums">{value}</p>
          )}
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{label}</p>
          {sub && !loading && (
            <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">{sub}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Dashboard Page
// ============================================================================

export function DashboardPage() {
  const { user, organisation } = useAuthStore();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [overdueTasks, setOverdueTasks] = useState<OverdueTaskEntry[]>([]);
  const [recentActivity, setRecentActivity] = useState<ActivityEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    else setIsRefreshing(true);
    setError(null);

    try {
      // Fetch stats in parallel
      const [mattersRes, overdueRes, membersRes, clientsRes] = await Promise.all([
        listMatters({ page_size: 1 }),
        listOverdueTasks({ page_size: 5 }),
        listMembers(),
        listClients({ page_size: 1 }),
      ]);

      // Count open matters separately
      const openRes = await listMatters({ status: 'open', page_size: 1 });

      // Count pending tasks across all matters (approximation via overdue endpoint)
      const pendingRes = await listOverdueTasks({ page_size: 100 });

      setStats({
        openMatters: openRes.total,
        totalMatters: mattersRes.total,
        overdueTasks: overdueRes.total,
        pendingTasks: pendingRes.total,
        totalMembers: membersRes.length,
        totalClients: clientsRes.total,
      });

      setOverdueTasks(overdueRes.items.slice(0, 5));

      // Fetch recent activity from first few open matters
      if (openRes.total > 0) {
        const recentMatters = await listMatters({ status: 'open', page_size: 3 });
        const activityResults = await Promise.allSettled(
          recentMatters.items.map((m) =>
            apiClient.get<{ items: ActivityEntry[]; total: number }>(
              `/matters/${m.id}/activity`,
              { page_size: 5 }
            )
          )
        );
        const allActivity: ActivityEntry[] = activityResults
          .filter((r): r is PromiseFulfilledResult<{ items: ActivityEntry[]; total: number }> => r.status === 'fulfilled')
          .flatMap((r) => r.value.items);
        // Sort by date desc, take top 8
        allActivity.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setRecentActivity(allActivity.slice(0, 8));
      }
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.detail : 'Could not load dashboard data.';
      setError(msg);
      if (!silent) toast.error(msg);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            {greeting()}, {user?.first_name || 'there'} 👋
          </h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            {organisation?.name} · {new Date().toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long' })}
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

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/20 dark:text-red-400">
          {error}{' '}
          <button onClick={() => void load()} className="underline font-medium">Retry</button>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Open Matters"
          value={stats?.openMatters ?? 0}
          icon={Briefcase}
          iconClass="bg-emerald-50 dark:bg-emerald-950/30"
          loading={isLoading}
          onClick={() => navigate('/matters')}
        />
        <StatCard
          label="Total Matters"
          value={stats?.totalMatters ?? 0}
          icon={TrendingUp}
          loading={isLoading}
          onClick={() => navigate('/matters')}
        />
        <StatCard
          label="Overdue Tasks"
          value={stats?.overdueTasks ?? 0}
          icon={AlertTriangle}
          iconClass={stats?.overdueTasks ? 'bg-red-50 dark:bg-red-950/30' : 'bg-slate-50 dark:bg-slate-800'}
          loading={isLoading}
          onClick={() => navigate('/tasks')}
        />
        <StatCard
          label="Pending Tasks"
          value={stats?.pendingTasks ?? 0}
          icon={CheckSquare}
          loading={isLoading}
          onClick={() => navigate('/tasks')}
        />
        <StatCard
          label="Team Members"
          value={stats?.totalMembers ?? 0}
          icon={Users}
          loading={isLoading}
          onClick={() => navigate('/admin/team')}
        />
        <StatCard
          label="Clients"
          value={stats?.totalClients ?? 0}
          icon={Users}
          iconClass="bg-blue-50 dark:bg-blue-950/30"
          loading={isLoading}
          onClick={() => navigate('/clients')}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Overdue Tasks */}
        <Card className="border-slate-200/80 dark:border-slate-700/80">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                <CardTitle className="text-base font-semibold">Overdue Tasks</CardTitle>
              </div>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => navigate('/tasks')}>
                View all <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
            <CardDescription className="text-xs">Tasks past their due date across all matters</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : overdueTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <CheckSquare className="h-10 w-10 text-emerald-300 mb-2" />
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">No overdue tasks</p>
                <p className="text-xs text-slate-400 mt-0.5">You&apos;re all caught up!</p>
              </div>
            ) : (
              <div className="space-y-2">
                {overdueTasks.map((task) => {
                  const daysOverdue = Math.floor(
                    (Date.now() - new Date(task.due_date).getTime()) / (1000 * 60 * 60 * 24)
                  );
                  return (
                    <div
                      key={task.id}
                      className="flex items-start gap-3 rounded-lg border border-slate-100 dark:border-slate-800 p-3 cursor-pointer hover:border-slate-200 dark:hover:border-slate-700 transition-colors"
                      onClick={() => navigate(`/matters/${task.matter_id}`)}
                    >
                      <Clock className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{task.title}</p>
                        <p className="text-xs text-slate-500 truncate">
                          {task.matter_reference_no} · {task.matter_title}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge className={cn('border text-[10px] font-semibold px-1.5 py-0', getPriorityColor(task.priority))}>
                          {task.priority}
                        </Badge>
                        <span className="text-[10px] text-red-500 font-medium whitespace-nowrap">
                          {daysOverdue}d late
                        </span>
                      </div>
                    </div>
                  );
                })}
                {(stats?.overdueTasks ?? 0) > 5 && (
                  <button
                    className="w-full pt-1 text-xs text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 text-center"
                    onClick={() => navigate('/tasks')}
                  >
                    + {(stats?.overdueTasks ?? 0) - 5} more overdue tasks
                  </button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="border-slate-200/80 dark:border-slate-700/80">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-slate-500" />
                <CardTitle className="text-base font-semibold">Recent Activity</CardTitle>
              </div>
            </div>
            <CardDescription className="text-xs">Latest events across your open matters</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-start gap-3">
                    <Skeleton className="h-2 w-2 rounded-full mt-1.5 shrink-0" />
                    <div className="space-y-1 flex-1">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : recentActivity.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <TrendingUp className="h-10 w-10 text-slate-200 mb-2" />
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">No recent activity</p>
                <p className="text-xs text-slate-400 mt-0.5">Events will appear here as you work on matters</p>
              </div>
            ) : (
              <div className="space-y-1">
                {recentActivity.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-start gap-3 rounded-lg p-2 hover:bg-slate-50 dark:hover:bg-slate-900/50 cursor-pointer transition-colors"
                    onClick={() => { if (entry.matter_id) navigate(`/matters/${entry.matter_id}`); }}
                  >
                    <div className={cn('mt-1.5 h-2 w-2 rounded-full shrink-0', getEventColor(entry.event_type))} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-700 dark:text-slate-300">
                        {formatEventType(entry.event_type)}
                        {Boolean(entry.payload?.title) && (
                          <span className="text-slate-500"> · {String(entry.payload.title)}</span>
                        )}
                      </p>
                      <p className="text-xs text-slate-400">{formatRelative(entry.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card className="border-slate-200/80 dark:border-slate-700/80">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => navigate('/matters/new')}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Briefcase className="h-4 w-4 mr-2" />
              New Matter
            </Button>
            <Button variant="outline" onClick={() => navigate('/clients/new')}>
              <Users className="h-4 w-4 mr-2" />
              New Client
            </Button>
            <Button variant="outline" onClick={() => navigate('/tasks')}>
              <CheckSquare className="h-4 w-4 mr-2" />
              View Tasks
            </Button>
            <Button variant="outline" onClick={() => navigate('/reports')}>
              <TrendingUp className="h-4 w-4 mr-2" />
              Generate Report
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default DashboardPage;
