'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  UserPlus,
  Search,
  MoreHorizontal,
  ShieldCheck,
  Shield,
  Eye,
  Mail,
  Clock,
  Check,
  X,
  Send,
  RotateCcw,
  Ban,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/lib/auth-store';
import { ApiClientError } from '@/lib/api-client';
import { UserRole } from '@/lib/types';
import {
  inviteMember,
  listMembers,
  removeMember,
  resendInvite,
  updateMemberRole,
  type MemberSummary,
} from '@/lib/api/members';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

function getRoleBadge(role: UserRole) {
  switch (role) {
    case UserRole.ADMIN:
      return (
        <Badge className="border-red-200 bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 hover:bg-red-100">
          <ShieldCheck className="mr-1 h-3 w-3" /> Admin
        </Badge>
      );
    case UserRole.MEMBER:
      return (
        <Badge className="border-blue-200 bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700 hover:bg-blue-100">
          <Shield className="mr-1 h-3 w-3" /> Member
        </Badge>
      );
    case UserRole.VIEWER:
      return (
        <Badge className="border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 hover:bg-slate-100">
          <Eye className="mr-1 h-3 w-3" /> Viewer
        </Badge>
      );
    default:
      return <Badge variant="outline">{role}</Badge>;
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function getInvitationStatusBadge() {
  return (
    <Badge className="border-amber-200 bg-amber-100 text-xs text-amber-700 hover:bg-amber-100">
      Pending
    </Badge>
  );
}

function InviteMemberDialog({
  children,
  onInvited,
}: {
  children: React.ReactNode;
  onInvited: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<UserRole>(UserRole.MEMBER);
  const [sending, setSending] = useState(false);

  const roles: { value: UserRole; label: string; desc: string }[] = [
    {
      value: UserRole.ADMIN,
      label: 'Admin',
      desc: 'Full access to settings, team management, and billing.',
    },
    {
      value: UserRole.MEMBER,
      label: 'Member',
      desc: 'Manage matters, tasks, and documents. No admin settings access.',
    },
    {
      value: UserRole.VIEWER,
      label: 'Viewer',
      desc: 'Read-only access to matters and documents.',
    },
  ];

  const handleSend = async () => {
    if (!email || !fullName) {
      return;
    }

    setSending(true);
    try {
      const response = await inviteMember({
        email,
        full_name: fullName,
        role,
      });
      await onInvited();
      setOpen(false);
      setEmail('');
      setFullName('');
      setRole(UserRole.MEMBER);
      toast.success('Invitation sent', { description: response.message });
    } catch (error) {
      const message =
        error instanceof ApiClientError ? error.detail : `Could not invite ${email}.`;
      toast.error(message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setEmail('');
          setFullName('');
          setRole(UserRole.MEMBER);
        }
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite Team Member</DialogTitle>
          <DialogDescription>
            Send an invitation to join your organisation on LegalOps.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="invite-email">Email Address</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="colleague@lawfirm.com.ng"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite-name">Full Name</Label>
            <Input
              id="invite-name"
              placeholder="First and last name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <div className="space-y-2">
              {roles.map((entry) => (
                <button
                  key={entry.value}
                  type="button"
                  className={cn(
                    'w-full rounded-lg border p-3 text-left transition-colors',
                    role === entry.value
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20'
                      : 'border-slate-200 hover:border-slate-300 dark:border-slate-700'
                  )}
                  onClick={() => setRole(entry.value)}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2',
                        role === entry.value
                          ? 'border-emerald-600 bg-emerald-600'
                          : 'border-slate-300'
                      )}
                    >
                      {role === entry.value && <Check className="h-3 w-3 text-white" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{entry.label}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{entry.desc}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-lg bg-blue-50 p-3 dark:bg-blue-950/20">
            <Mail className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
            <p className="text-xs text-blue-700 dark:text-blue-400">
              The backend creates the member immediately with a pending invite state and returns an
              invitation link for delivery.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleSend()}
            disabled={!email || !fullName || sending}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {sending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Send Invitation
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TeamPage() {
  const { user } = useAuthStore();
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);

  const loadMembers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await listMembers();
      setMembers(response);
    } catch (err) {
      const message =
        err instanceof ApiClientError ? err.detail : 'Unable to load team members.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadMembers();
  }, []);

  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) {
      return members;
    }
    const q = searchQuery.toLowerCase();
    return members.filter(
      (member) =>
        member.first_name.toLowerCase().includes(q) ||
        member.last_name.toLowerCase().includes(q) ||
        member.email.toLowerCase().includes(q) ||
        member.full_name.toLowerCase().includes(q)
    );
  }, [members, searchQuery]);

  const pendingInvitations = useMemo(
    () => members.filter((member) => member.has_pending_invite),
    [members]
  );

  const currentUserId = user?.id;

  const handleRoleChange = async (member: MemberSummary, newRole: UserRole) => {
    setBusyMemberId(member.id);
    try {
      const updated = await updateMemberRole(member.id, { role: newRole });
      setMembers((current) =>
        current.map((entry) => (entry.id === updated.id ? updated : entry))
      );
      toast.success('Role updated', {
        description: `${updated.full_name} is now a ${newRole}.`,
      });
    } catch (error) {
      const message =
        error instanceof ApiClientError ? error.detail : 'Could not update member role.';
      toast.error(message);
    } finally {
      setBusyMemberId(null);
    }
  };

  const handleRemoveMember = async (member: MemberSummary) => {
    setBusyMemberId(member.id);
    try {
      await removeMember(member.id);
      setMembers((current) => current.filter((entry) => entry.id !== member.id));
      toast.success('Member removed', {
        description: `${member.full_name} has been removed.`,
      });
    } catch (error) {
      const message =
        error instanceof ApiClientError ? error.detail : 'Could not remove member.';
      toast.error(message);
    } finally {
      setBusyMemberId(null);
    }
  };

  const handleResendInvitation = async (member: MemberSummary) => {
    setBusyMemberId(member.id);
    try {
      const response = await resendInvite(member.id);
      toast.success('Invitation resent', { description: response.message });
    } catch (error) {
      const message =
        error instanceof ApiClientError ? error.detail : 'Could not resend invitation.';
      toast.error(message);
    } finally {
      setBusyMemberId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Team Management
          </h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            {members.length} members · {members.filter((entry) => entry.is_active).length} active
          </p>
        </div>
        <InviteMemberDialog onInvited={loadMembers}>
          <Button className="bg-emerald-600 text-white shadow-sm hover:bg-emerald-700">
            <UserPlus className="mr-2 h-4 w-4" />
            Invite Member
          </Button>
        </InviteMemberDialog>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          placeholder="Search by name or email..."
          className="pl-9"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
      </div>

      {isLoading ? (
        <Card className="border-slate-200/80 dark:border-slate-700/80">
          <CardContent className="flex items-center gap-3 py-10">
            <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
            <span className="text-sm text-slate-600 dark:text-slate-400">
              Loading team members...
            </span>
          </CardContent>
        </Card>
      ) : error ? (
        <Card className="border-slate-200/80 dark:border-slate-700/80">
          <CardContent className="space-y-4 py-8">
            <p className="text-sm text-slate-600 dark:text-slate-400">{error}</p>
            <Button variant="outline" onClick={() => void loadMembers()}>
              Try Again
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="border-slate-200/80 dark:border-slate-700/80">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-100 dark:border-slate-800">
                      <TableHead className="w-[280px]">Name</TableHead>
                      <TableHead className="hidden md:table-cell">Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden lg:table-cell">Joined</TableHead>
                      <TableHead className="w-[60px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMembers.map((member) => {
                      const isSelf = member.id === currentUserId;
                      const isBusy = busyMemberId === member.id;
                      return (
                        <TableRow
                          key={member.id}
                          className="border-slate-50 dark:border-slate-800/50"
                        >
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8">
                                <AvatarFallback className="bg-emerald-100 text-xs font-bold text-emerald-700">
                                  {member.first_name[0]}
                                  {member.last_name[0] || member.first_name[1] || ''}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                  {member.full_name}
                                  {isSelf && (
                                    <span className="ml-1.5 text-xs text-emerald-600">(You)</span>
                                  )}
                                </p>
                                <p className="max-w-[200px] truncate text-xs text-slate-500 md:hidden">
                                  {member.email}
                                </p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <span className="text-sm text-slate-600 dark:text-slate-400">
                              {member.email}
                            </span>
                          </TableCell>
                          <TableCell>{getRoleBadge(member.role as UserRole)}</TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-xs',
                                member.has_pending_invite
                                  ? 'border-amber-200 bg-amber-50 text-amber-700'
                                  : member.is_active
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                    : 'border-slate-200 bg-slate-50 text-slate-500'
                              )}
                            >
                              <span
                                className={cn(
                                  'mr-1.5 h-1.5 w-1.5 rounded-full',
                                  member.has_pending_invite
                                    ? 'bg-amber-500'
                                    : member.is_active
                                      ? 'bg-emerald-500'
                                      : 'bg-slate-400'
                                )}
                              />
                              {member.has_pending_invite
                                ? 'Pending Invite'
                                : member.is_active
                                  ? 'Active'
                                  : 'Inactive'}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            <span className="text-sm text-slate-500">{formatDate(member.joined_at || '')}</span>
                          </TableCell>
                          <TableCell>
                            {!isSelf ? (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    disabled={isBusy}
                                  >
                                    {isBusy ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <MoreHorizontal className="h-4 w-4" />
                                    )}
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuLabel>Change Role</DropdownMenuLabel>
                                  <DropdownMenuSeparator />
                                  {Object.values(UserRole)
                                    .filter((role) => role !== member.role)
                                    .map((role) => (
                                      <DropdownMenuItem
                                        key={role}
                                        onClick={() => void handleRoleChange(member, role)}
                                      >
                                        Set as {role.charAt(0).toUpperCase() + role.slice(1)}
                                      </DropdownMenuItem>
                                    ))}
                                  {member.has_pending_invite && (
                                    <>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        onClick={() => void handleResendInvitation(member)}
                                      >
                                        <RotateCcw className="mr-2 h-4 w-4" />
                                        Resend Invite
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                  <DropdownMenuSeparator />
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <DropdownMenuItem
                                        className="text-red-600 focus:text-red-600"
                                        onSelect={(event) => event.preventDefault()}
                                      >
                                        <X className="mr-2 h-4 w-4" />
                                        Remove Member
                                      </DropdownMenuItem>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>
                                          Remove {member.full_name}?
                                        </AlertDialogTitle>
                                        <AlertDialogDescription>
                                          This will revoke their access to the organisation.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction
                                          className="bg-red-600 hover:bg-red-700"
                                          onClick={() => void handleRemoveMember(member)}
                                        >
                                          Remove
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            ) : (
                              <span className="text-xs italic text-slate-400">Current user</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {pendingInvitations.length > 0 && (
            <Card className="border-slate-200/80 dark:border-slate-700/80">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-amber-600" />
                  <div>
                    <CardTitle className="text-base font-semibold">
                      Pending Invitations
                    </CardTitle>
                    <CardDescription className="mt-0.5 text-xs">
                      {pendingInvitations.length} pending
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {pendingInvitations.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between gap-4 rounded-lg border border-slate-100 p-3 dark:border-slate-800"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-slate-100 text-xs font-bold text-slate-500">
                            {member.first_name[0]}
                            {member.last_name[0] || member.first_name[1] || ''}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                            {member.full_name}
                          </p>
                          <div className="mt-0.5 flex items-center gap-2">
                            <span className="truncate text-xs text-slate-400">{member.email}</span>
                            <span className="text-slate-300">&middot;</span>
                            <span className="text-xs text-slate-400">
                              {formatDate(member.joined_at)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {getInvitationStatusBadge()}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs"
                          disabled={busyMemberId === member.id}
                          onClick={() => void handleResendInvitation(member)}
                        >
                          {busyMemberId === member.id ? (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          ) : (
                            <RotateCcw className="mr-1 h-3 w-3" />
                          )}
                          Resend
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                            >
                              <Ban className="mr-1 h-3 w-3" />
                              Revoke
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remove Pending Invite</AlertDialogTitle>
                              <AlertDialogDescription>
                                Remove the pending invitation for {member.email}? They will lose the
                                invite and need a new one later.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-red-600 hover:bg-red-700"
                                onClick={() => void handleRemoveMember(member)}
                              >
                                Remove
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

export default TeamPage;
