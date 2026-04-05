'use client';

import React, { useMemo } from 'react';
import {
  Briefcase,
  Users,
  AlertTriangle,
  FileText,
  ArrowRight,
  ArrowRightLeft,
  Plus,
  CheckCircle2,
  FilePlus,
  Edit,
  Mail,
  Clock,
  ChevronRight,
  CalendarDays,
  UserPlus,
  BarChart3,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { navigate } from '@/lib/router';
import { useAuthStore } from '@/lib/auth-store';
import {
  MatterStatus,
  TaskStatus,
  TaskPriority,
} from '@/lib/types';
import type { TaskResponse, ActivityResponse } from '@/lib/types';

import {
  mockMatters,
  mockClients,
  mockTasks,
  mockDocuments,
  mockActivities,
} from '@/lib/mock-data';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';

// ============================================================================
// Helpers
// ============================================================================

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);
  const diffWeek = Math.floor(diffDay / 7);
  const diffMonth = Math.floor(diffDay / 30);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  if (diffWeek < 4) return `${diffWeek}w ago`;
  if (diffMonth < 12) return `${diffMonth}mo ago`;
  return date.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDueDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
  });
}

function getDaysUntil(dateStr: string): number {
  const due = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

// ============================================================================
// Activity Event Config
// ============================================================================

interface ActivityEventConfig {
  icon: React.ElementType;
  color: string;
  bgColor: string;
  borderColor: string;
}

function getActivityConfig(activity: ActivityResponse): ActivityEventConfig {
  const action = activity.action;

  if (action.includes('matter.created'))
    return { icon: Briefcase, color: 'text-emerald-600', bgColor: 'bg-emerald-50', borderColor: 'border-l-emerald-500' };
  if (action.includes('matter.updated'))
    return { icon: ArrowRightLeft, color: 'text-blue-600', bgColor: 'bg-blue-50', borderColor: 'border-l-blue-500' };
  if (action.includes('task.created'))
    return { icon: Plus, color: 'text-violet-600', bgColor: 'bg-violet-50', borderColor: 'border-l-violet-500' };
  if (action.includes('task.completed'))
    return { icon: CheckCircle2, color: 'text-teal-600', bgColor: 'bg-teal-50', borderColor: 'border-l-teal-500' };
  if (action.includes('task.updated'))
    return { icon: ArrowRight, color: 'text-violet-600', bgColor: 'bg-violet-50', borderColor: 'border-l-violet-500' };
  if (action.includes('document.uploaded'))
    return { icon: FilePlus, color: 'text-amber-600', bgColor: 'bg-amber-50', borderColor: 'border-l-amber-500' };
  if (action.includes('document.updated'))
    return { icon: Edit, color: 'text-amber-700', bgColor: 'bg-amber-50', borderColor: 'border-l-amber-700' };
  if (action.includes('email'))
    return { icon: Mail, color: 'text-sky-600', bgColor: 'bg-sky-50', borderColor: 'border-l-sky-500' };
  if (action.includes('client'))
    return { icon: Users, color: 'text-indigo-600', bgColor: 'bg-indigo-50', borderColor: 'border-l-indigo-500' };

  return { icon: ArrowRight, color: 'text-slate-500', bgColor: 'bg-slate-50', borderColor: 'border-l-slate-400' };
}

// ============================================================================
// Priority Badge
// ============================================================================

function PriorityBadge({ priority }: { priority: string }) {
  const config: Record<string, { label: string; className: string }> = {
    high: { label: 'High', className: 'bg-red-100 text-red-700 border-red-200 hover:bg-red-100' },
    medium: { label: 'Medium', className: 'bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100' },
    low: { label: 'Low', className: 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-100' },
  };
  const c = config[priority] || config.low;
  return <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 font-semibold', c.className)}>{c.label}</Badge>;
}

// ============================================================================
// Status Config
// ============================================================================

const STATUS_CONFIG: Record<string, { label: string; color: string; bgBar: string }> = {
  intake: { label: 'Intake', color: 'bg-slate-500', bgBar: 'bg-slate-400' },
  open: { label: 'Open', color: 'bg-emerald-500', bgBar: 'bg-emerald-500' },
  pending: { label: 'Pending', color: 'bg-amber-500', bgBar: 'bg-amber-500' },
  in_review: { label: 'In Review', color: 'bg-blue-500', bgBar: 'bg-blue-500' },
  closed: { label: 'Closed', color: 'bg-slate-400', bgBar: 'bg-slate-300' },
  archived: { label: 'Archived', color: 'bg-slate-300', bgBar: 'bg-slate-200' },
};

// ============================================================================
// Stat Card
// ============================================================================

interface StatCardProps {
  label: string;
  value: number | string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  trend?: string;
  trendUp?: boolean;
  onClick?: () => void;
}

function StatCard({ label, value, icon: Icon, iconBg, iconColor, trend, trendUp, onClick }: StatCardProps) {
  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-all duration-200 border-slate-200/80 dark:border-slate-700/80 group"
      onClick={onClick}
    >
      <CardContent className="p-4 md:p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-2 flex-1">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              {label}
            </p>
            <p className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-slate-50 tracking-tight">
              {value}
            </p>
            {trend && (
              <div className="flex items-center gap-1">
                {trendUp !== undefined && (
                  <TrendingUp className={cn('h-3 w-3', trendUp ? 'text-emerald-500' : 'text-red-500')} />
                )}
                <span className={cn('text-xs font-medium', trendUp ? 'text-emerald-600' : 'text-red-600')}>
                  {trend}
                </span>
              </div>
            )}
          </div>
          <div className={cn('flex h-10 w-10 md:h-11 md:w-11 items-center justify-center rounded-xl shrink-0', iconBg)}>
            <Icon className={cn('h-5 w-5 md:h-5 md:w-5', iconColor)} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Dashboard Page
// ============================================================================

export function DashboardPage() {
  const { user } = useAuthStore();
  const now = new Date();

  // -------------------------------------------------------------------------
  // Compute Stats
  // -------------------------------------------------------------------------
  const stats = useMemo(() => {
    const activeMatters = mockMatters.filter((m) =>
      [MatterStatus.OPEN, MatterStatus.PENDING, MatterStatus.IN_REVIEW, MatterStatus.INTAKE].includes(m.status as MatterStatus)
    );
    const activeClients = mockClients.filter((c) => c.is_active);
    const overdueTasks = mockTasks.filter(
      (t) => t.due_date && t.status !== TaskStatus.DONE && t.status !== TaskStatus.CANCELLED && new Date(t.due_date) < now
    );
    const docsThisMonth = mockDocuments.filter((d) => {
      const created = new Date(d.created_at);
      return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
    });

    return {
      activeMatters: activeMatters.length,
      totalClients: activeClients.length,
      overdueTasks: overdueTasks.length,
      docsThisMonth: docsThisMonth.length,
    };
  }, [now]);

  // -------------------------------------------------------------------------
  // Matters by Status
  // -------------------------------------------------------------------------
  const mattersByStatus = useMemo(() => {
    const statusOrder = ['intake', 'open', 'pending', 'in_review', 'closed', 'archived'];
    const total = mockMatters.length;
    return statusOrder
      .map((status) => {
        const count = mockMatters.filter((m) => m.status === status).length;
        return { status, count, percentage: total > 0 ? Math.round((count / total) * 100) : 0 };
      })
      .filter((s) => s.count > 0);
  }, []);

  // -------------------------------------------------------------------------
  // Overdue Tasks
  // -------------------------------------------------------------------------
  const overdueTaskList = useMemo(() => {
    return mockTasks
      .filter(
        (t) => t.due_date && t.status !== TaskStatus.DONE && t.status !== TaskStatus.CANCELLED && new Date(t.due_date) < now
      )
      .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime());
  }, [now]);

  // -------------------------------------------------------------------------
  // Upcoming Deadlines (next 7 days, not overdue)
  // -------------------------------------------------------------------------
  const upcomingDeadlines = useMemo(() => {
    const sevenDaysFromNow = new Date(now);
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    return mockTasks
      .filter(
        (t) =>
          t.due_date &&
          t.status !== TaskStatus.DONE &&
          t.status !== TaskStatus.CANCELLED &&
          new Date(t.due_date) >= now &&
          new Date(t.due_date) <= sevenDaysFromNow
      )
      .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())
      .slice(0, 5);
  }, [now]);

  // -------------------------------------------------------------------------
  // Recent Activities (sorted by date, newest first)
  // -------------------------------------------------------------------------
  const recentActivities = useMemo(() => {
    return [...mockActivities].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    ).slice(0, 10);
  }, []);

  // -------------------------------------------------------------------------
  // Greeting
  // -------------------------------------------------------------------------
  const greeting = useMemo(() => {
    const hour = now.getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }, [now]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50 tracking-tight">
            Dashboard
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {greeting}, {user?.first_name || 'there'}. Here&apos;s your practice overview.
          </p>
        </div>
        <Button
          onClick={() => navigate('/matters/new')}
          className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Matter
        </Button>
      </div>

      {/* ================================================================= */}
      {/* Stats Row */}
      {/* ================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Active Matters"
          value={stats.activeMatters}
          icon={Briefcase}
          iconBg="bg-emerald-50 dark:bg-emerald-950/40"
          iconColor="text-emerald-600 dark:text-emerald-400"
          trend="+1 this week"
          trendUp={true}
          onClick={() => navigate('/matters')}
        />
        <StatCard
          label="Total Clients"
          value={stats.totalClients}
          icon={Users}
          iconBg="bg-blue-50 dark:bg-blue-950/40"
          iconColor="text-blue-600 dark:text-blue-400"
          trend="+2 this month"
          trendUp={true}
          onClick={() => navigate('/clients')}
        />
        <StatCard
          label="Overdue Tasks"
          value={stats.overdueTasks}
          icon={AlertTriangle}
          iconBg="bg-red-50 dark:bg-red-950/40"
          iconColor="text-red-600 dark:text-red-400"
          trend={stats.overdueTasks > 0 ? 'Needs attention' : 'All on track'}
          trendUp={stats.overdueTasks === 0}
          onClick={() => navigate('/tasks')}
        />
        <StatCard
          label="Documents This Month"
          value={stats.docsThisMonth}
          icon={FileText}
          iconBg="bg-violet-50 dark:bg-violet-950/40"
          iconColor="text-violet-600 dark:text-violet-400"
          trend={stats.docsThisMonth > 0 ? `${stats.docsThisMonth} added` : 'No new docs'}
          trendUp={stats.docsThisMonth > 0}
          onClick={() => navigate('/documents')}
        />
      </div>

      {/* ================================================================= */}
      {/* Main Content Grid */}
      {/* ================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ---- Left Column (wider) ---- */}
        <div className="lg:col-span-2 space-y-6">

          {/* Recent Activity */}
          <Card className="border-slate-200/80 dark:border-slate-700/80">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold">Recent Activity</CardTitle>
                  <CardDescription className="text-xs mt-0.5">Latest updates across all matters</CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30 text-xs"
                  onClick={() => navigate('/matters')}
                >
                  View All
                  <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="space-y-0">
                {recentActivities.map((activity, index) => {
                  const config = getActivityConfig(activity);
                  const EventIcon = config.icon;
                  return (
                    <React.Fragment key={activity.id}>
                      <div
                        className={cn(
                          'flex items-start gap-3 py-3 px-3 border-l-2 rounded-r-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer',
                          config.borderColor
                        )}
                      >
                        <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg shrink-0 mt-0.5', config.bgColor)}>
                          <EventIcon className={cn('h-4 w-4', config.color)} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-700 dark:text-slate-300 leading-snug">
                            {activity.description}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[11px] text-slate-400 dark:text-slate-500">
                              {formatRelativeTime(activity.created_at)}
                            </span>
                            {activity.user && (
                              <>
                                <span className="text-[11px] text-slate-300 dark:text-slate-600">·</span>
                                <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                                  {activity.user.first_name} {activity.user.last_name}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      {index < recentActivities.length - 1 && (
                        <Separator className="ml-14" />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Overdue Tasks */}
          {overdueTaskList.length > 0 && (
            <Card className="border-red-200/80 dark:border-red-900/40 bg-red-50/30 dark:bg-red-950/10">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/40">
                      <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-semibold text-red-900 dark:text-red-200">
                        Overdue Tasks
                      </CardTitle>
                      <CardDescription className="text-xs mt-0.5 text-red-600/70 dark:text-red-400/70">
                        {overdueTaskList.length} task{overdueTaskList.length !== 1 ? 's' : ''} past due
                      </CardDescription>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-900/30 text-xs"
                    onClick={() => navigate('/tasks')}
                  >
                    View All Tasks
                    <ChevronRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="space-y-2">
                  {overdueTaskList.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center gap-3 p-3 rounded-lg bg-white dark:bg-slate-900 border border-red-100 dark:border-red-900/30 hover:shadow-sm transition-shadow cursor-pointer"
                      onClick={() => task.matter_id && navigate(`/matters/${task.matter_id}`)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                          {task.title}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          {task.matter && (
                            <span className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                              {task.matter.matter_number}
                            </span>
                          )}
                          <PriorityBadge priority={task.priority} />
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="flex items-center gap-1 text-red-600 dark:text-red-400">
                          <Clock className="h-3.5 w-3.5" />
                          <span className="text-xs font-semibold">
                            {formatDueDate(task.due_date!)}
                          </span>
                        </div>
                        <p className="text-[10px] text-red-500/80 dark:text-red-400/80 mt-0.5">
                          {Math.abs(getDaysUntil(task.due_date!))}d overdue
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* ---- Right Column (narrower) ---- */}
        <div className="space-y-6">

          {/* Matters by Status */}
          <Card className="border-slate-200/80 dark:border-slate-700/80">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Matters by Status</CardTitle>
              <CardDescription className="text-xs">Distribution of {mockMatters.length} total matters</CardDescription>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <div className="space-y-3">
                {mattersByStatus.map(({ status, count, percentage }) => {
                  const config = STATUS_CONFIG[status] || STATUS_CONFIG.open;
                  return (
                    <div
                      key={status}
                      className="group cursor-pointer"
                      onClick={() => navigate(`/matters?status=${status}`)}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                          {config.label}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {count}
                          </span>
                          <span className="text-[11px] text-slate-400 dark:text-slate-500 w-8 text-right">
                            {percentage}%
                          </span>
                        </div>
                      </div>
                      <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className={cn('h-full rounded-full transition-all duration-500', config.bgBar)}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Upcoming Deadlines */}
          <Card className="border-slate-200/80 dark:border-slate-700/80">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold">Upcoming Deadlines</CardTitle>
                  <CardDescription className="text-xs mt-0.5">Next 7 days</CardDescription>
                </div>
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-900/30">
                  <CalendarDays className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {upcomingDeadlines.length === 0 ? (
                <div className="text-center py-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/30 mx-auto mb-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">No upcoming deadlines</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[340px] overflow-y-auto custom-scrollbar">
                  {upcomingDeadlines.map((task) => {
                    const daysLeft = getDaysUntil(task.due_date!);
                    const isUrgent = daysLeft <= 2;
                    return (
                      <div
                        key={task.id}
                        className={cn(
                          'flex items-start gap-3 p-3 rounded-lg border transition-shadow hover:shadow-sm cursor-pointer',
                          isUrgent
                            ? 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-200/80 dark:border-amber-900/30'
                            : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800'
                        )}
                        onClick={() => task.matter_id && navigate(`/matters/${task.matter_id}`)}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                            {task.title}
                          </p>
                          {task.matter && (
                            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">
                              {task.matter.matter_number} — {task.matter.title.split('—')[0].trim()}
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-1.5">
                            <PriorityBadge priority={task.priority} />
                            <span className="text-[11px] text-slate-400 dark:text-slate-500">
                              {formatDueDate(task.due_date!)}
                            </span>
                          </div>
                        </div>
                        <div
                          className={cn(
                            'flex flex-col items-center justify-center px-2 py-1 rounded-lg text-xs font-bold shrink-0',
                            isUrgent
                              ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                              : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                          )}
                        >
                          <span>{daysLeft}d</span>
                          <span className="text-[9px] font-normal opacity-70">left</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card className="border-slate-200/80 dark:border-slate-700/80">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Quick Actions</CardTitle>
              <CardDescription className="text-xs">Common actions and shortcuts</CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full justify-start gap-3 h-11 hover:bg-emerald-50 hover:border-emerald-200 dark:hover:bg-emerald-950/20 dark:hover:border-emerald-800 text-slate-700 dark:text-slate-300"
                  onClick={() => navigate('/matters/new')}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/40">
                    <Briefcase className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="flex flex-col items-start">
                    <span className="text-sm font-medium">New Matter</span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">Create a new legal matter</span>
                  </div>
                </Button>

                <Button
                  variant="outline"
                  className="w-full justify-start gap-3 h-11 hover:bg-blue-50 hover:border-blue-200 dark:hover:bg-blue-950/20 dark:hover:border-blue-800 text-slate-700 dark:text-slate-300"
                  onClick={() => navigate('/clients/new')}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/40">
                    <UserPlus className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex flex-col items-start">
                    <span className="text-sm font-medium">New Client</span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">Add a new client</span>
                  </div>
                </Button>

                <Button
                  variant="outline"
                  className="w-full justify-start gap-3 h-11 hover:bg-violet-50 hover:border-violet-200 dark:hover:bg-violet-950/20 dark:hover:border-violet-800 text-slate-700 dark:text-slate-300"
                  onClick={() => navigate('/reports')}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 dark:bg-violet-950/40">
                    <BarChart3 className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div className="flex flex-col items-start">
                    <span className="text-sm font-medium">Generate Report</span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">View practice analytics</span>
                  </div>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default DashboardPage;
