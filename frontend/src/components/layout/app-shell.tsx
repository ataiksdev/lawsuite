'use client';

import React, { useCallback, useMemo, useState } from 'react';
import {
  Home,
  Briefcase,
  Users,
  CheckSquare,
  FileText,
  BarChart3,
  Settings,
  LogOut,
  Scale,
  Menu,
  Bell,
  ChevronRight,
  ChevronLeft,
  UsersRound,
  Puzzle,
  CreditCard,
  Shield,
  Sparkles,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { cn } from '@/lib/utils';
import { useAuthStore } from '@/lib/auth-store';
import {
  useCurrentRoute,
  navigate,
  getBreadcrumbSegments,
} from '@/lib/router';
import { UserRole } from '@/lib/types';

import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { TrialBanner } from '@/components/ui/trial-banner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

import { mockOrganisation } from '@/lib/mock-data';

// ============================================================================
// Sidebar collapsed state — persisted in localStorage
// ============================================================================

interface SidebarStore {
  collapsed: boolean;
  toggle: () => void;
  setCollapsed: (v: boolean) => void;
}

export const useSidebarStore = create<SidebarStore>()(
  persist(
    (set) => ({
      collapsed: false,
      toggle: () => set((s) => ({ collapsed: !s.collapsed })),
      setCollapsed: (v) => set({ collapsed: v }),
    }),
    { name: 'lawsuite-sidebar' }
  )
);

// ============================================================================
// Notification store — replaces mock data, uses activity API in future
// ============================================================================

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  link?: string;
  is_read: boolean;
  created_at: string;
}

interface NotificationStore {
  notifications: AppNotification[];
  markRead: (id: string) => void;
  markAllRead: () => void;
  addNotification: (n: Omit<AppNotification, 'id' | 'created_at' | 'is_read'>) => void;
}

export const useNotificationStore = create<NotificationStore>()(
  persist(
    (set) => ({
      notifications: [],
      markRead: (id) =>
        set((s) => ({
          notifications: s.notifications.map((n) =>
            n.id === id ? { ...n, is_read: true } : n
          ),
        })),
      markAllRead: () =>
        set((s) => ({
          notifications: s.notifications.map((n) => ({ ...n, is_read: true })),
        })),
      addNotification: (n) =>
        set((s) => ({
          notifications: [
            {
              ...n,
              id: crypto.randomUUID(),
              is_read: false,
              created_at: new Date().toISOString(),
            },
            ...s.notifications.slice(0, 49), // keep last 50
          ],
        })),
    }),
    { name: 'lawsuite-notifications' }
  )
);

function notifIcon(type: AppNotification['type']) {
  switch (type) {
    case 'success':  return <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />;
    case 'warning':  return <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />;
    case 'error':    return <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />;
    default:         return <Info className="h-4 w-4 text-blue-500 shrink-0" />;
  }
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ============================================================================
// Navigation Items
// ============================================================================

interface NavItem {
  label: string;
  path: string;
  icon: React.ElementType;
  adminOnly?: boolean;
}

const mainNavItems: NavItem[] = [
  { label: 'Dashboard',  path: '/',          icon: Home },
  { label: 'Matters',    path: '/matters',   icon: Briefcase },
  { label: 'Clients',    path: '/clients',   icon: Users },
  { label: 'Tasks',      path: '/tasks',     icon: CheckSquare },
  { label: 'Documents',  path: '/documents', icon: FileText },
  { label: 'Reports',    path: '/reports',   icon: BarChart3 },
];

const adminNavItems: NavItem[] = [
  { label: 'Team',         path: '/admin/team',         icon: UsersRound, adminOnly: true },
  { label: 'Integrations', path: '/admin/integrations', icon: Puzzle,     adminOnly: true },
  { label: 'Billing',      path: '/admin/billing',      icon: CreditCard, adminOnly: true },
];

const platformAdminNavItem: NavItem = {
  label: 'Platform Admin',
  path: '/platform',
  icon: Sparkles,
  adminOnly: true,
};

const bottomNavItems: NavItem[] = [
  { label: 'Settings', path: '/settings', icon: Settings },
];

// ============================================================================
// Helpers
// ============================================================================

function isRouteActive(currentRoute: string, path: string): boolean {
  if (path === '/') return currentRoute === '/' || currentRoute === '';
  const normalized = path.endsWith('/') ? path : path + '/';
  return currentRoute === path || currentRoute.startsWith(normalized);
}

// ============================================================================
// Nav Item Button — supports collapsed (icon-only) mode
// ============================================================================

function NavItemButton({
  item,
  isActive,
  collapsed,
  onClick,
}: {
  item: NavItem;
  isActive: boolean;
  collapsed: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  const btn = (
    <Button
      variant="ghost"
      className={cn(
        'h-9 rounded-lg transition-all font-medium',
        collapsed
          ? 'w-9 justify-center px-0'
          : 'w-full justify-start gap-3 px-3',
        isActive
          ? 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 hover:text-white'
          : 'text-slate-600 dark:text-slate-400 hover:text-emerald-700 dark:hover:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
      )}
      onClick={onClick}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && <span className="text-sm truncate">{item.label}</span>}
    </Button>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{btn}</TooltipTrigger>
        <TooltipContent side="right" className="text-xs">{item.label}</TooltipContent>
      </Tooltip>
    );
  }
  return btn;
}

// ============================================================================
// Sidebar Content
// ============================================================================

function SidebarContent({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const currentRoute = useCurrentRoute();
  const { user, organisation, logout } = useAuthStore();
  const { toggle } = useSidebarStore();
  const isAdmin = user?.role === UserRole.ADMIN;

  const platformAdminOrgId = process.env.NEXT_PUBLIC_PLATFORM_ADMIN_ORG_ID;
  const isPlatformAdmin =
    isAdmin && !!platformAdminOrgId && organisation?.id === platformAdminOrgId;

  const visibleAdminItems = isAdmin
    ? [...adminNavItems, ...(isPlatformAdmin ? [platformAdminNavItem] : [])]
    : [];

  const handleNavClick = useCallback(
    (path: string) => {
      navigate(path);
      onNavigate?.();
    },
    [onNavigate]
  );

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex h-full flex-col">
        {/* Logo + collapse toggle */}
        <div
          className={cn(
            'flex h-16 items-center border-b border-emerald-100 dark:border-emerald-900/30',
            collapsed ? 'justify-center px-2' : 'gap-3 px-4'
          )}
        >
          {!collapsed && (
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white shrink-0">
              <Scale className="h-5 w-5" />
            </div>
          )}
          {!collapsed && (
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-sm font-bold text-emerald-900 dark:text-emerald-100 tracking-tight truncate">
                LegalOps
              </span>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium truncate">
                {organisation?.name || mockOrganisation.name}
              </span>
            </div>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                onClick={toggle}
              >
                {collapsed
                  ? <ChevronRight className="h-4 w-4" />
                  : <ChevronLeft className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              {collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Navigation */}
        <ScrollArea className={cn('flex-1 py-4', collapsed ? 'px-1.5' : 'px-3')}>
          <div className={cn('space-y-1', collapsed && 'flex flex-col items-center')}>
            {/* Main nav */}
            <div className="space-y-1 w-full">
              {mainNavItems.map((item) => (
                <NavItemButton
                  key={item.path}
                  item={item}
                  isActive={isRouteActive(currentRoute, item.path)}
                  collapsed={collapsed}
                  onClick={() => handleNavClick(item.path)}
                />
              ))}
            </div>

            {/* Admin section */}
            {visibleAdminItems.length > 0 && (
              <>
                <Separator className="my-3 bg-emerald-100 dark:bg-emerald-900/30" />
                {!collapsed && (
                  <div className="px-3 mb-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-500 dark:text-emerald-400">
                      Administration
                    </span>
                  </div>
                )}
                <div className="space-y-1 w-full">
                  {visibleAdminItems.map((item) => (
                    <NavItemButton
                      key={item.path}
                      item={item}
                      isActive={isRouteActive(currentRoute, item.path)}
                      collapsed={collapsed}
                      onClick={() => handleNavClick(item.path)}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </ScrollArea>

        {/* Bottom section */}
        <div
          className={cn(
            'border-t border-emerald-100 dark:border-emerald-900/30 py-3 space-y-1',
            collapsed ? 'px-1.5 flex flex-col items-center' : 'px-3'
          )}
        >
          {bottomNavItems.map((item) => (
            <NavItemButton
              key={item.path}
              item={item}
              isActive={isRouteActive(currentRoute, item.path)}
              collapsed={collapsed}
              onClick={() => handleNavClick(item.path)}
            />
          ))}

          <Separator className="my-2 bg-emerald-100 dark:bg-emerald-900/30" />

          {/* Logout */}
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg"
                  onClick={logout}
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">Log Out</TooltipContent>
            </Tooltip>
          ) : (
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 px-3 h-9 text-slate-600 dark:text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 dark:hover:text-red-400 rounded-lg"
              onClick={logout}
            >
              <LogOut className="h-4 w-4" />
              <span className="text-sm font-medium">Log Out</span>
            </Button>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

// ============================================================================
// Header Bar with real notification store
// ============================================================================

function HeaderBar({ onMenuClick }: { onMenuClick: () => void }) {
  const currentRoute = useCurrentRoute();
  const { user } = useAuthStore();
  const { notifications, markRead, markAllRead } = useNotificationStore();
  const breadcrumbs = getBreadcrumbSegments(currentRoute);

  const unread = useMemo(() => notifications.filter((n) => !n.is_read), [notifications]);
  const userInitials = user ? `${user.first_name[0] ?? ''}${user.last_name[0] ?? ''}` : 'LO';

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-white/80 dark:bg-slate-950/80 backdrop-blur-md px-4">
      {/* Hamburger — visible at all sizes for collapsed sidebar */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-slate-500 hover:text-emerald-600 shrink-0"
        onClick={onMenuClick}
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Breadcrumbs */}
      <Breadcrumb className="hidden sm:flex min-w-0">
        <BreadcrumbList>
          {breadcrumbs.map((segment, index) => (
            <React.Fragment key={segment.path}>
              {index > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem>
                {index < breadcrumbs.length - 1 ? (
                  <BreadcrumbLink
                    href={`#${segment.path}`}
                    className="text-slate-500 hover:text-emerald-600 dark:text-slate-400 dark:hover:text-emerald-400 text-sm"
                  >
                    {segment.name}
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage className="text-slate-900 dark:text-slate-100 font-medium text-sm truncate max-w-[200px]">
                    {segment.name}
                  </BreadcrumbPage>
                )}
              </BreadcrumbItem>
            </React.Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex-1" />

      {/* Notifications */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative h-8 w-8 text-slate-500 hover:text-emerald-600"
          >
            <Bell className="h-4 w-4" />
            {unread.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-500 text-[9px] font-bold text-white flex items-center justify-center">
                {unread.length > 9 ? '9+' : unread.length}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          <DropdownMenuLabel className="flex items-center justify-between py-2">
            <span className="font-semibold">Notifications</span>
            {unread.length > 0 && (
              <button
                className="text-xs text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                onClick={markAllRead}
              >
                Mark all read
              </button>
            )}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {notifications.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-slate-400">
              <Bell className="h-8 w-8 mx-auto mb-2 opacity-30" />
              No notifications yet
            </div>
          ) : (
            notifications.slice(0, 8).map((notif) => (
              <DropdownMenuItem
                key={notif.id}
                className={cn(
                  'flex items-start gap-2.5 p-3 cursor-pointer',
                  !notif.is_read && 'bg-emerald-50/60 dark:bg-emerald-950/20'
                )}
                onClick={() => {
                  markRead(notif.id);
                  if (notif.link) navigate(notif.link);
                }}
              >
                {notifIcon(notif.type)}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium truncate">{notif.title}</span>
                    <span className="text-[10px] text-slate-400 shrink-0">{formatRelative(notif.created_at)}</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5">{notif.message}</p>
                </div>
                {!notif.is_read && (
                  <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0 mt-1" />
                )}
              </DropdownMenuItem>
            ))
          )}
          {notifications.length > 8 && (
            <div className="px-3 py-2 text-center">
              <span className="text-xs text-slate-400">{notifications.length - 8} older notifications</span>
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* User Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="flex items-center gap-2 px-2 h-8 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 rounded-lg"
          >
            <Avatar className="h-7 w-7">
              <AvatarImage src={(user as any)?.avatar_url} />
              <AvatarFallback className="bg-emerald-100 text-emerald-700 text-xs font-bold">
                {userInitials}
              </AvatarFallback>
            </Avatar>
            <div className="hidden md:flex flex-col items-start max-w-[120px]">
              <span className="text-xs font-medium text-slate-900 dark:text-slate-100 leading-none truncate w-full">
                {user ? `${user.first_name} ${user.last_name}` : 'User'}
              </span>
              <span className="text-[10px] text-slate-500 leading-none mt-0.5">
                {user?.role === UserRole.ADMIN ? 'Admin' : 'Member'}
              </span>
            </div>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel>
            <div className="flex flex-col">
              <span className="truncate">{user ? `${user.first_name} ${user.last_name}` : 'User'}</span>
              <span className="text-xs font-normal text-muted-foreground truncate">{user?.email}</span>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => navigate('/settings')}>
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </DropdownMenuItem>
            {user?.role === UserRole.ADMIN && (
              <DropdownMenuItem onClick={() => navigate('/admin/team')}>
                <Shield className="mr-2 h-4 w-4" />
                Admin Panel
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-red-600 focus:text-red-600"
            onClick={() => useAuthStore.getState().logout()}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}

// ============================================================================
// App Shell
// ============================================================================

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { collapsed, setCollapsed } = useSidebarStore();
  // Mobile overlay — separate from the desktop collapsed state
  const [mobileOpen, setMobileOpen] = useState(false);

  // On header hamburger click: on mobile open overlay, on desktop toggle collapse
  const handleMenuClick = useCallback(() => {
    if (window.innerWidth < 768) {
      setMobileOpen((o) => !o);
    } else {
      setCollapsed(!collapsed);
    }
  }, [collapsed, setCollapsed]);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
      {/* ── Desktop sidebar — always rendered, width transitions ── */}
      <aside
        className={cn(
          'hidden md:flex flex-col border-r border-emerald-100 dark:border-emerald-900/20',
          'bg-white dark:bg-slate-950 shrink-0 transition-all duration-200 ease-in-out overflow-hidden',
          collapsed ? 'w-14' : 'w-64'
        )}
      >
        <SidebarContent collapsed={collapsed} />
      </aside>

      {/* ── Mobile overlay sidebar ── */}
      {mobileOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <aside
            className={cn(
              'fixed left-0 top-0 z-50 h-full w-64 flex flex-col',
              'border-r border-emerald-100 dark:border-emerald-900/20 bg-white dark:bg-slate-950',
              'shadow-xl md:hidden transition-transform duration-200'
            )}
          >
            <SidebarContent collapsed={false} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </>
      )}

      {/* ── Main area ── */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <TrialBanner />
        <HeaderBar onMenuClick={handleMenuClick} />

        <main className="flex-1 overflow-y-auto">
          <div className="p-4 md:p-6 max-w-[1600px] mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export default AppShell;
