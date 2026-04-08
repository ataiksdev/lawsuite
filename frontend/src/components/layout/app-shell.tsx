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
  UsersRound,
  Puzzle,
  CreditCard,
  Shield,
} from 'lucide-react';

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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

import { mockNotifications, mockOrganisation } from '@/lib/mock-data';

// ============================================================================
// Navigation Items
// ============================================================================

interface NavItem {
  label: string;
  path: string;
  icon: React.ElementType;
  adminOnly?: boolean;
  badge?: string | number;
}

const mainNavItems: NavItem[] = [
  { label: 'Dashboard', path: '/', icon: Home },
  { label: 'Matters', path: '/matters', icon: Briefcase },
  { label: 'Clients', path: '/clients', icon: Users },
  { label: 'Tasks', path: '/tasks', icon: CheckSquare },
  { label: 'Documents', path: '/documents', icon: FileText },
  { label: 'Reports', path: '/reports', icon: BarChart3 },
];

const adminNavItems: NavItem[] = [
  { label: 'Team Management', path: '/admin/team', icon: UsersRound, adminOnly: true },
  { label: 'Integrations', path: '/admin/integrations', icon: Puzzle, adminOnly: true },
  { label: 'Billing', path: '/admin/billing', icon: CreditCard, adminOnly: true },
];

const bottomNavItems: NavItem[] = [
  { label: 'Settings', path: '/settings', icon: Settings },
];

// ============================================================================
// Helper: Check if route is active
// ============================================================================

function isRouteActive(currentRoute: string, path: string, exact = false): boolean {
  if (exact) {
    return currentRoute === path || currentRoute === path + '/';
  }
  const normalized = path.endsWith('/') ? path : path + '/';
  return currentRoute === path || currentRoute.startsWith(normalized);
}

// ============================================================================
// Nav Item Button
// ============================================================================

function NavItemButton({
  item,
  isActive,
  onClick,
}: {
  item: NavItem;
  isActive: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <Button
      variant="ghost"
      className={cn(
        'w-full justify-start gap-3 px-3 h-9 rounded-lg transition-all font-medium',
        isActive
          ? 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 hover:text-white'
          : 'text-slate-600 dark:text-slate-400 hover:text-emerald-700 dark:hover:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
      )}
      onClick={onClick}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="text-sm truncate">{item.label}</span>
      {item.badge && !isActive && (
        <Badge
          variant="secondary"
          className="ml-auto h-5 min-w-[20px] px-1.5 text-[10px] bg-amber-100 text-amber-700 border-amber-200"
        >
          {item.badge}
        </Badge>
      )}
    </Button>
  );
}

// ============================================================================
// Sidebar Content
// ============================================================================

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const currentRoute = useCurrentRoute();
  const { user, organisation, logout } = useAuthStore();
  const isAdmin = user?.role === UserRole.ADMIN;

  const unreadNotifications = mockNotifications.filter((n) => !n.is_read).length;

  const tasksWithBadge = useMemo(() => {
    if (unreadNotifications <= 0) return mainNavItems;
    return mainNavItems.map((item) =>
      item.path === '/tasks' ? { ...item, badge: unreadNotifications } : item
    );
  }, [unreadNotifications]);

  const visibleAdminItems = isAdmin ? adminNavItems : [];

  const handleNavClick = useCallback(
    (path: string) => {
      navigate(path);
      onNavigate?.();
    },
    [onNavigate]
  );

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 px-4 border-b border-emerald-100 dark:border-emerald-900/30">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white">
          <Scale className="h-5 w-5" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-bold text-emerald-900 dark:text-emerald-100 tracking-tight">
            LegalOps
          </span>
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
            {organisation?.name || mockOrganisation.name}
          </span>
        </div>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 px-3 py-4">
        <div className="space-y-1">
          {/* Main Nav */}
          <div className="space-y-1">
            {tasksWithBadge.map((item) => (
              <NavItemButton
                key={item.path}
                item={item}
                isActive={isRouteActive(currentRoute, item.path)}
                onClick={() => handleNavClick(item.path)}
              />
            ))}
          </div>

          {/* Admin Section */}
          {visibleAdminItems.length > 0 && (
            <>
              <Separator className="my-3 bg-emerald-100 dark:bg-emerald-900/30" />
              <div className="px-3 mb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-500 dark:text-emerald-400">
                  Administration
                </span>
              </div>
              <div className="space-y-1">
                {visibleAdminItems.map((item) => (
                  <NavItemButton
                    key={item.path}
                    item={item}
                    isActive={isRouteActive(currentRoute, item.path)}
                    onClick={() => handleNavClick(item.path)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </ScrollArea>

      {/* Bottom Section */}
      <div className="border-t border-emerald-100 dark:border-emerald-900/30 p-3 space-y-1">
        {bottomNavItems.map((item) => (
          <NavItemButton
            key={item.path}
            item={item}
            isActive={isRouteActive(currentRoute, item.path)}
            onClick={() => handleNavClick(item.path)}
          />
        ))}

        <Separator className="my-2 bg-emerald-100 dark:bg-emerald-900/30" />

        {/* Logout */}
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 px-3 h-9 text-slate-600 dark:text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 dark:hover:text-red-400 rounded-lg"
          onClick={logout}
        >
          <LogOut className="h-4 w-4" />
          <span className="text-sm font-medium">Log Out</span>
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Header Bar
// ============================================================================

function HeaderBar() {
  const currentRoute = useCurrentRoute();
  const { user } = useAuthStore();
  const breadcrumbs = getBreadcrumbSegments(currentRoute);

  const userInitials = user
    ? `${user.first_name[0]}${user.last_name[0]}`
    : 'LO';

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-white/80 dark:bg-slate-950/80 backdrop-blur-md px-4 md:px-6">
      {/* Breadcrumbs */}
      <Breadcrumb className="hidden md:flex">
        <BreadcrumbList>
          {breadcrumbs.map((segment, index) => (
            <React.Fragment key={segment.path}>
              {index > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem>
                {index < breadcrumbs.length - 1 ? (
                  <BreadcrumbLink
                    href={`#${segment.path}`}
                    className="text-slate-500 hover:text-emerald-600 dark:text-slate-400 dark:hover:text-emerald-400"
                  >
                    {segment.name}
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage className="text-slate-900 dark:text-slate-100 font-medium">
                    {segment.name}
                  </BreadcrumbPage>
                )}
              </BreadcrumbItem>
            </React.Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right Section */}
      <div className="flex items-center gap-2">
        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400"
            >
              <Bell className="h-5 w-5" />
              {mockNotifications.filter((n) => !n.is_read).length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center">
                  {mockNotifications.filter((n) => !n.is_read).length}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span className="font-semibold">Notifications</span>
              <span className="text-xs text-muted-foreground">
                {mockNotifications.filter((n) => !n.is_read).length} unread
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {mockNotifications.slice(0, 4).map((notif) => (
              <DropdownMenuItem
                key={notif.id}
                className={cn(
                  'flex flex-col items-start gap-1 p-3 cursor-pointer',
                  !notif.is_read && 'bg-emerald-50 dark:bg-emerald-950/20'
                )}
                onClick={() => notif.link && navigate(notif.link)}
              >
                <div className="flex items-center gap-2 w-full">
                  {!notif.is_read && (
                    <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                  )}
                  <span className="text-sm font-medium truncate">{notif.title}</span>
                </div>
                <span className="text-xs text-muted-foreground line-clamp-2 ml-4">
                  {notif.message}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="flex items-center gap-2 px-2 h-9 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 rounded-lg"
            >
              <Avatar className="h-7 w-7">
                <AvatarImage src={user?.avatar_url} alt={user?.first_name} />
                <AvatarFallback className="bg-emerald-100 text-emerald-700 text-xs font-bold">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
              <div className="hidden md:flex flex-col items-start">
                <span className="text-sm font-medium text-slate-900 dark:text-slate-100 leading-none">
                  {user ? `${user.first_name} ${user.last_name}` : 'LegalOps User'}
                </span>
                <span className="text-[10px] text-slate-500 leading-none mt-0.5">
                  {user?.role === UserRole.ADMIN ? 'Administrator' : user?.role || 'Member'}
                </span>
              </div>
              <ChevronRight className="h-3.5 w-3.5 text-slate-400 hidden md:block" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span>{user ? `${user.first_name} ${user.last_name}` : 'User'}</span>
                <span className="text-xs font-normal text-muted-foreground">{user?.email}</span>
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
      </div>
    </header>
  );
}

// ============================================================================
// App Shell - Main Component
// ============================================================================

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 flex-col border-r border-emerald-100 dark:border-emerald-900/20 bg-white dark:bg-slate-950 shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation Menu</SheetTitle>
          </SheetHeader>
          <SidebarContent onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Main Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile Header */}
        <div className="lg:hidden flex h-14 items-center gap-3 border-b bg-white dark:bg-slate-950 px-4">
          <Button
            variant="ghost"
            size="icon"
            className="text-slate-500"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-600 text-white">
              <Scale className="h-4 w-4" />
            </div>
            <span className="text-sm font-bold text-emerald-900 dark:text-emerald-100">
              LegalOps
            </span>
          </div>
        </div>

        {/* Trial Banner — shown when org is in trial */}
        <TrialBanner />

        {/* Header */}
        <HeaderBar />

        {/* Content */}
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
