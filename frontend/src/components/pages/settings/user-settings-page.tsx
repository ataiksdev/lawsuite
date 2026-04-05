'use client';

import React, { useState } from 'react';
import {
  User,
  Mail,
  Shield,
  Lock,
  Eye,
  Moon,
  Sun,
  Key,
  Monitor,
  Smartphone,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/lib/auth-store';
import { UserRole } from '@/lib/types';
import { useTheme } from 'next-themes';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

// ============================================================================
// Helpers
// ============================================================================

function getRoleBadge(role: UserRole) {
  switch (role) {
    case UserRole.ADMIN:
      return <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100 text-xs font-semibold">Administrator</Badge>;
    case UserRole.MEMBER:
      return <Badge className="bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-100 text-xs font-semibold">Member</Badge>;
    case UserRole.VIEWER:
      return <Badge className="bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-100 text-xs font-semibold">Viewer</Badge>;
    default:
      return <Badge variant="outline">{role}</Badge>;
  }
}

// ============================================================================
// Active Session
// ============================================================================

interface Session {
  id: string;
  device: string;
  browser: string;
  location: string;
  lastActive: string;
  current: boolean;
}

const mockSessions: Session[] = [
  { id: 'sess-001', device: 'Laptop', browser: 'Chrome on macOS', location: 'Lagos, Nigeria', lastActive: 'Just now', current: true },
  { id: 'sess-002', device: 'iPhone', browser: 'Safari on iOS', location: 'Lagos, Nigeria', lastActive: '2 hours ago', current: false },
  { id: 'sess-003', device: 'Desktop', browser: 'Firefox on Windows', location: 'Abuja, Nigeria', lastActive: '3 days ago', current: false },
];

// ============================================================================
// User Settings Page
// ============================================================================

export function UserSettingsPage() {
  const { user } = useAuthStore();
  const { theme, setTheme } = useTheme();

  const [firstName, setFirstName] = useState(user?.first_name || '');
  const [lastName, setLastName] = useState(user?.last_name || '');
  const [savingProfile, setSavingProfile] = useState(false);

  // Change password dialog state
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Notification preferences
  const [emailNotifications, setEmailNotifications] = useState({
    matterUpdates: true,
    taskAssigned: true,
    taskDueSoon: true,
    documentShared: true,
    weeklyDigest: false,
    marketingEmails: false,
  });

  if (!user) return null;

  const userInitials = `${user.first_name[0]}${user.last_name[0]}`;

  const handleSaveProfile = () => {
    setSavingProfile(true);
    setTimeout(() => {
      setSavingProfile(false);
      useAuthStore.getState().setUser({ ...user, first_name: firstName, last_name: lastName });
      toast.success('Profile updated', { description: 'Your name has been updated.' });
    }, 800);
  };

  const handleChangePassword = () => {
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    setChangingPassword(true);
    setTimeout(() => {
      setChangingPassword(false);
      setPasswordDialogOpen(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Password changed', { description: 'Your password has been updated successfully.' });
    }, 1000);
  };

  const handleRevokeSession = (session: Session) => {
    toast.success('Session revoked', { description: `Session on ${session.browser} has been terminated.` });
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50 tracking-tight">Settings</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Manage your profile, security, and preferences.</p>
      </div>

      {/* Profile Section */}
      <Card className="border-slate-200/80 dark:border-slate-700/80">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-slate-500" />
            <CardTitle className="text-base font-semibold">Profile</CardTitle>
          </div>
          <CardDescription className="text-xs">Your personal information and account details.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="bg-emerald-100 text-emerald-700 text-xl font-bold">
                {userInitials}
              </AvatarFallback>
            </Avatar>
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {firstName} {lastName}
              </h3>
              <p className="text-sm text-slate-500">{user.email}</p>
              <div className="mt-1">{getRoleBadge(user.role)}</div>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="first-name">First Name</Label>
              <Input id="first-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last-name">Last Name</Label>
              <Input id="last-name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input id="email" value={user.email} disabled className="bg-slate-50 dark:bg-slate-900 max-w-sm" />
            <p className="text-[11px] text-slate-400">Contact your administrator to change your email address.</p>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSaveProfile} disabled={savingProfile || (firstName === user.first_name && lastName === user.last_name)} className="bg-emerald-600 hover:bg-emerald-700">
              {savingProfile ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Security Section */}
      <Card className="border-slate-200/80 dark:border-slate-700/80">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-slate-500" />
            <CardTitle className="text-base font-semibold">Security</CardTitle>
          </div>
          <CardDescription className="text-xs">Manage your password and active sessions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Password</Label>
              <p className="text-xs text-slate-500">Last changed 30 days ago</p>
            </div>
            <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Key className="h-4 w-4 mr-2" />
                  Change Password
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Change Password</DialogTitle>
                  <DialogDescription>Enter your current password and choose a new one.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label htmlFor="current-password">Current Password</Label>
                    <Input id="current-password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-password">New Password</Label>
                    <Input id="new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirm New Password</Label>
                    <Input id="confirm-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setPasswordDialogOpen(false)}>Cancel</Button>
                  <Button
                    onClick={handleChangePassword}
                    disabled={!currentPassword || !newPassword || !confirmPassword || changingPassword}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    {changingPassword ? 'Changing...' : 'Update Password'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <Separator />

          <div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Active Sessions</h4>
            <div className="space-y-2">
              {mockSessions.map((session) => (
                <div key={session.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg shrink-0', session.device === 'iPhone' ? 'bg-blue-50 dark:bg-blue-950/40' : 'bg-slate-50 dark:bg-slate-800')}>
                      {session.device === 'iPhone' ? <Smartphone className="h-4 w-4 text-blue-600" /> : <Monitor className="h-4 w-4 text-slate-600" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                        {session.browser}
                        {session.current && <span className="text-xs text-emerald-600 ml-1.5">(This device)</span>}
                      </p>
                      <p className="text-xs text-slate-400">{session.location} &middot; {session.lastActive}</p>
                    </div>
                  </div>
                  {!session.current && (
                    <Button variant="ghost" size="sm" className="h-8 text-xs text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => handleRevokeSession(session)}>
                      Revoke
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Preferences Section */}
      <Card className="border-slate-200/80 dark:border-slate-700/80">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Moon className="h-5 w-5 text-slate-500" />
            <CardTitle className="text-base font-semibold">Preferences</CardTitle>
          </div>
          <CardDescription className="text-xs">Customize your notifications and appearance.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Theme */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                {theme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                Theme
              </Label>
              <p className="text-xs text-slate-500">Choose between light and dark mode.</p>
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 p-0.5">
              <Button
                variant="ghost"
                size="sm"
                className={cn('h-7 text-xs px-3', theme === 'light' && 'bg-slate-100 dark:bg-slate-800')}
                onClick={() => setTheme('light')}
              >
                <Sun className="h-3.5 w-3.5 mr-1" />
                Light
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={cn('h-7 text-xs px-3', theme === 'dark' && 'bg-slate-100 dark:bg-slate-800')}
                onClick={() => setTheme('dark')}
              >
                <Moon className="h-3.5 w-3.5 mr-1" />
                Dark
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={cn('h-7 text-xs px-3', theme === 'system' && 'bg-slate-100 dark:bg-slate-800')}
                onClick={() => setTheme('system')}
              >
                <Monitor className="h-3.5 w-3.5 mr-1" />
                System
              </Button>
            </div>
          </div>

          <Separator />

          {/* Email Notifications */}
          <div>
            <Label className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3 block">Email Notifications</Label>
            <div className="space-y-3">
              {[
                { key: 'matterUpdates', label: 'Matter updates', desc: 'When a matter status changes or is updated' },
                { key: 'taskAssigned', label: 'Task assigned to me', desc: 'When a new task is assigned to you' },
                { key: 'taskDueSoon', label: 'Task due soon', desc: 'When a task deadline is approaching' },
                { key: 'documentShared', label: 'Document shared', desc: 'When a document is shared with you' },
                { key: 'weeklyDigest', label: 'Weekly digest', desc: 'Summary of weekly activity via email' },
                { key: 'marketingEmails', label: 'Marketing emails', desc: 'Product updates and new features' },
              ].map(({ key, label, desc }) => (
                <div key={key} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-700 dark:text-slate-300">{label}</p>
                    <p className="text-xs text-slate-400">{desc}</p>
                  </div>
                  <Switch
                    checked={emailNotifications[key as keyof typeof emailNotifications]}
                    onCheckedChange={(checked) => {
                      setEmailNotifications((prev) => ({ ...prev, [key]: checked }));
                      toast.success('Notification preference updated');
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default UserSettingsPage;
