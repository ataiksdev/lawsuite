'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  AlertTriangle,
  Bell,
  BellOff,
  Briefcase,
  Calendar,
  CheckCircle2,
  Circle,
  CircleDot,
  Clock,
  Filter,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Send,
  Star,
  Trash2,
  User,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { navigate } from '@/lib/router';
import { handleApiError, extractErrorMessage } from '@/lib/error-utils';
import { useAuthStore } from '@/lib/auth-store';
import { useFilterStore } from '@/lib/filter-store';
import { useNotificationStore } from '@/components/layout/app-shell';
import { listMatters, type BackendMatter } from '@/lib/api/matters';
import { listMembers, type MemberSummary } from '@/lib/api/members';
import {
  addTaskCommentToMatterNote,
  listMatterNotes,
  type BackendMatterNote,
} from '@/lib/api/calendar';
import {
  addTaskComment,
  addTaskWatcher,
  createTask,
  deleteTask,
  deleteTaskComment,
  listMatterTasks,
  listOverdueTasks,
  listTaskComments,
  listTaskWatchers,
  removeTaskWatcher,
  updateTask,
  type BackendTask,
  type BackendTaskPriority,
  type BackendTaskStatus,
  type TaskComment,
  type TaskWatcher,
} from '@/lib/api/tasks';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// ── Types ─────────────────────────────────────────────────────────────────────

type EnrichedTask = BackendTask & {
  matter_title?: string;
  matter_reference_no?: string;
  client_name?: string;
};

interface TaskFormState {
  taskId?: string;
  matterId: string;
  title: string;
  notes: string;
  priority: BackendTaskPriority;
  assignedTo: string;
  dueDate: string;
  status: BackendTaskStatus;
}

// ── Column config ─────────────────────────────────────────────────────────────

const TASK_COLUMNS: {
  id: BackendTaskStatus;
  title: string;
  icon: React.ElementType;
  headerCls: string;
  boardCls: string;
  badgeCls: string;
  emptyBorderCls: string;
}[] = [
  {
    id: 'todo',
    title: 'To Do',
    icon: Circle,
    headerCls: 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60',
    boardCls: 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950',
    badgeCls: 'border-slate-200 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    emptyBorderCls: 'border-slate-200 dark:border-slate-700',
  },
  {
    id: 'in_progress',
    title: 'In Progress',
    icon: CircleDot,
    headerCls: 'border-blue-200 bg-blue-50/70 dark:border-blue-800/50 dark:bg-blue-950/25',
    boardCls: 'border-blue-100 dark:border-blue-900/40 bg-white dark:bg-slate-950',
    badgeCls: 'border-blue-200 bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    emptyBorderCls: 'border-blue-200 dark:border-blue-800',
  },
  {
    id: 'done',
    title: 'Done',
    icon: CheckCircle2,
    headerCls: 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-800/40 dark:bg-emerald-950/25',
    boardCls: 'border-emerald-100 dark:border-emerald-900/30 bg-white dark:bg-slate-950',
    badgeCls: 'border-emerald-200 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    emptyBorderCls: 'border-emerald-200 dark:border-emerald-800',
  },
  {
    id: 'cancelled',
    title: 'Cancelled',
    icon: XCircle,
    headerCls: 'border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/30',
    boardCls: 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950',
    badgeCls: 'border-slate-200 bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500',
    emptyBorderCls: 'border-slate-200 dark:border-slate-700',
  },
];

const PRIORITY_STYLE: Record<BackendTaskPriority, string> = {
  low:    'border-slate-200 bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  medium: 'border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  high:   'border-red-200 bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(v?: string | null) {
  if (!v) return 'No due date';
  return new Date(v).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtRelative(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function isOverdue(due?: string | null, status?: BackendTaskStatus) {
  if (!due || status === 'done' || status === 'cancelled') return false;
  return new Date(due) < new Date();
}

function initials(name: string) {
  return name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

function emptyForm(defaultMatterId: string): TaskFormState {
  return { matterId: defaultMatterId, title: '', notes: '', priority: 'medium', assignedTo: 'unassigned', dueDate: '', status: 'todo' };
}

function estimateTimeInColumn(task: BackendTask): string {
  const ms = Date.now() - new Date(task.updated_at || task.created_at).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return '< 1 hr';
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return `${Math.floor(d / 7)}w`;
}

// ── Draggable Task Card ───────────────────────────────────────────────────────

function TaskCard({
  task, memberNameById, isBusy, onEdit, onDelete, onStatusChange, onClick, cardBorderCls,
}: {
  task: EnrichedTask;
  memberNameById: Map<string, string>;
  isBusy: boolean;
  onEdit: (t: EnrichedTask) => void;
  onDelete: (t: EnrichedTask) => void;
  onStatusChange: (t: EnrichedTask, s: BackendTaskStatus) => void;
  onClick: (t: EnrichedTask) => void;
  cardBorderCls: string;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  const overdue = isOverdue(task.due_date, task.status);

  return (
    <div
      ref={setNodeRef} {...attributes} {...listeners}
      className={cn(
        'group rounded-lg border p-3 bg-white dark:bg-slate-900 shadow-sm',
        'transition-all duration-150 select-none cursor-grab active:cursor-grabbing',
        cardBorderCls,
        overdue && 'border-red-200 bg-red-50/50 dark:border-red-900/40 dark:bg-red-950/10',
        isDragging && 'opacity-40 scale-95 ring-2 ring-emerald-400',
      )}
      onClick={(e) => { if (!isDragging) { e.stopPropagation(); onClick(task); } }}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className={cn('text-sm font-medium leading-snug text-slate-900 dark:text-slate-100', task.status === 'cancelled' && 'line-through text-slate-400')}>
            {task.title}
          </p>
          {task.client_name && (
            <p className="mt-0.5 text-[11px] text-slate-400 truncate">{task.client_name}</p>
          )}
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); navigate(`/matters/${task.matter_id}`); }}
            className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-emerald-600 hover:underline dark:text-emerald-400"
          >
            <Briefcase className="h-2.5 w-2.5" />
            {task.matter_reference_no ?? 'View matter'}
          </button>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild onPointerDown={(e) => e.stopPropagation()}>
            <Button
              variant="ghost" size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0 transition-opacity"
              disabled={isBusy}
              onClick={(e) => e.stopPropagation()}
            >
              {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MoreHorizontal className="h-3.5 w-3.5" />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onCloseAutoFocus={(e) => e.preventDefault()}>
            <DropdownMenuItem onSelect={() => onEdit(task)}>Edit</DropdownMenuItem>
            <DropdownMenuSeparator />
            {TASK_COLUMNS.filter((c) => c.id !== task.status).map((c) => (
              <DropdownMenuItem key={c.id} onSelect={() => onStatusChange(task, c.id)}>
                Move to {c.title}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-red-600 focus:text-red-600" onSelect={() => onDelete(task)}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {task.notes && (
        <p className="mt-1.5 text-xs text-slate-500 line-clamp-2 dark:text-slate-400">{task.notes}</p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <Badge className={cn('border text-[10px] px-1.5 py-0', PRIORITY_STYLE[task.priority])}>
          {task.priority}
        </Badge>
        {task.assigned_to && (
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
            <User className="h-2.5 w-2.5" />
            {memberNameById.get(task.assigned_to) ?? 'Assigned'}
          </span>
        )}
        {task.due_date && (
          <span className={cn('inline-flex items-center gap-1 text-[11px]', overdue ? 'text-red-500' : 'text-slate-400')}>
            <Calendar className="h-2.5 w-2.5" />
            {fmtDate(task.due_date)}
            {overdue && <AlertTriangle className="h-2.5 w-2.5" />}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Droppable Column ──────────────────────────────────────────────────────────

function KanbanColumn({
  col, tasks, memberNameById, busyTaskId, onEdit, onDelete, onStatusChange, onCardClick, onAdd,
}: {
  col: typeof TASK_COLUMNS[number];
  tasks: EnrichedTask[];
  memberNameById: Map<string, string>;
  busyTaskId: string | null;
  onEdit: (t: EnrichedTask) => void;
  onDelete: (t: EnrichedTask) => void;
  onStatusChange: (t: EnrichedTask, s: BackendTaskStatus) => void;
  onCardClick: (t: EnrichedTask) => void;
  onAdd: (s: BackendTaskStatus) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.id });
  const Icon = col.icon;

  return (
    <div className="flex flex-col min-w-[260px] max-w-[320px] w-full flex-1">
      <div className={cn('rounded-t-xl border border-b-0 px-3 py-2.5 flex items-center justify-between', col.headerCls)}>
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-slate-500" />
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{col.title}</span>
        </div>
        <Badge className={cn('border text-xs tabular-nums', col.badgeCls)}>{tasks.length}</Badge>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          'flex-1 rounded-b-xl border p-2 space-y-2 min-h-[200px] transition-colors',
          col.boardCls,
          isOver && 'ring-2 ring-emerald-400 ring-offset-1 bg-emerald-50/20 dark:bg-emerald-950/10',
        )}
      >
        <Button
          variant="ghost" size="sm"
          className="w-full h-8 text-xs text-slate-400 hover:text-slate-600 border border-dashed border-slate-200 dark:border-slate-700 hover:border-slate-400"
          onClick={() => onAdd(col.id)}
        >
          <Plus className="h-3.5 w-3.5 mr-1" /> Add task
        </Button>
        {tasks.length === 0 ? (
          <div className={cn('rounded-lg border border-dashed p-5 text-center text-xs text-slate-400', col.emptyBorderCls)}>
            Drop tasks here
          </div>
        ) : (
          tasks.map((t) => (
            <TaskCard
              key={t.id} task={t} memberNameById={memberNameById}
              isBusy={busyTaskId === t.id} onEdit={onEdit} onDelete={onDelete}
              onStatusChange={onStatusChange} onClick={onCardClick}
              cardBorderCls={col.boardCls.replace('bg-white dark:bg-slate-950', '').trim()}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── Task Detail Sheet (Comments + Watchers) ───────────────────────────────────

function TaskDetailSheet({
  task, memberNameById, members, onClose, onEdit, onStatusChange, onWatchersChange,
}: {
  task: EnrichedTask | null;
  memberNameById: Map<string, string>;
  members: MemberSummary[];
  onClose: () => void;
  onEdit: (t: EnrichedTask) => void;
  onStatusChange: (t: EnrichedTask, s: BackendTaskStatus) => void;
  onWatchersChange?: () => void;
}) {
  const { user } = useAuthStore();
  const { addNotification } = useNotificationStore();

  const [comments, setComments] = useState<TaskComment[]>([]);
  const [matterNotes, setMatterNotes] = useState<BackendMatterNote[]>([]);
  const [watchers, setWatchers] = useState<TaskWatcher[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [loadingWatchers, setLoadingWatchers] = useState(false);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [commentBody, setCommentBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [addingToNoteId, setAddingToNoteId] = useState<string | null>(null);
  const [togglingWatch, setTogglingWatch] = useState(false);
  const [noteTargetByComment, setNoteTargetByComment] = useState<Record<string, string>>({});
  const commentEndRef = useRef<HTMLDivElement>(null);

  const isWatching = useMemo(
    () => watchers.some((w) => w.user_id === user?.id),
    [watchers, user?.id]
  );

  useEffect(() => {
    if (!task) { setComments([]); setMatterNotes([]); setWatchers([]); setCommentBody(''); setNoteTargetByComment({}); return; }
    const currentTask = task;
    let cancelled = false;

    async function load() {
      setLoadingComments(true);
      setLoadingWatchers(true);
      setLoadingNotes(true);
      try {
        const [c, w, n] = await Promise.all([
          listTaskComments(currentTask.matter_id, currentTask.id),
          listTaskWatchers(currentTask.matter_id, currentTask.id),
          listMatterNotes(currentTask.matter_id),
        ]);
        if (!cancelled) { setComments(c); setWatchers(w); setMatterNotes(n); }
      } catch {
        // Non-fatal — comments/watchers may not be implemented on backend yet
      } finally {
        if (!cancelled) { setLoadingComments(false); setLoadingWatchers(false); setLoadingNotes(false); }
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [task?.id, task?.matter_id]);

  useEffect(() => {
    commentEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments.length]);

  if (!task) return null;

  const col = TASK_COLUMNS.find((c) => c.id === task.status)!;
  const overdue = isOverdue(task.due_date, task.status);
  const assigneeName = task.assigned_to ? (memberNameById.get(task.assigned_to) ?? 'Assigned') : 'Unassigned';

  const handleSubmitComment = async () => {
    if (!commentBody.trim()) return;
    setSubmitting(true);
    try {
      const created = await addTaskComment(task.matter_id, task.id, { body: commentBody.trim() });
      setComments((c) => [...c, created]);
      setCommentBody('');

      // Notify watchers
      watchers.forEach((w) => {
        if (w.user_id !== user?.id) {
          addNotification({
            type: 'info',
            title: `Comment on "${task.title}"`,
            message: `${user?.first_name ?? 'Someone'} commented: ${commentBody.trim().slice(0, 80)}`,
            link: `/matters/${task.matter_id}`,
          });
        }
      });
    } catch (err) {
      handleApiError(err, 'Unable to post comment.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    setDeletingCommentId(commentId);
    try {
      await deleteTaskComment(task.matter_id, task.id, commentId);
      setComments((c) => c.filter((x) => x.id !== commentId));
      toast.success('Comment deleted.');
    } catch (err) {
      handleApiError(err, 'Unable to delete comment.');
    } finally {
      setDeletingCommentId(null);
    }
  };

  const handleAddCommentToNote = async (commentId: string) => {
    const noteId = noteTargetByComment[commentId];
    if (!noteId) return;
    setAddingToNoteId(commentId);
    try {
      const updatedNote = await addTaskCommentToMatterNote(task.matter_id, task.id, commentId, noteId);
      setMatterNotes((current) => current.map((note) => (note.id === updatedNote.id ? updatedNote : note)));
      toast.success('Comment added to note.');
    } catch (err) {
      handleApiError(err, 'Unable to add comment to note.');
    } finally {
      setAddingToNoteId(null);
    }
  };

  const handleToggleWatch = async () => {
    if (!user) return;
    setTogglingWatch(true);
    try {
      if (isWatching) {
        await removeTaskWatcher(task.matter_id, task.id, user.id);
        setWatchers((w) => w.filter((x) => x.user_id !== user.id));
        toast.success('Unwatched task.');
      } else {
        const watcher = await addTaskWatcher(task.matter_id, task.id, user.id);
        setWatchers((w) => [...w, watcher]);
        toast.success('Now watching this task.');
      }
      onWatchersChange?.();
    } catch (err) {
      handleApiError(err, 'Unable to update watch status.');
    } finally {
      setTogglingWatch(false);
    }
  };

  const handleAddWatcher = async (userId: string) => {
    if (watchers.some((w) => w.user_id === userId)) return;
    try {
      const watcher = await addTaskWatcher(task.matter_id, task.id, userId);
      setWatchers((w) => [...w, watcher]);
      const member = members.find((m) => m.id === userId);
      // Notify the newly added watcher
      addNotification({
        type: 'info',
        title: `You are now watching "${task.title}"`,
        message: `${user?.first_name ?? 'Someone'} added you as a watcher.`,
        link: `/matters/${task.matter_id}`,
      });
      toast.success(`${member?.full_name ?? 'Member'} added as watcher.`);
    } catch (err) {
      handleApiError(err, 'Unable to add watcher.');
    }
  };

  const handleStatusChange = (newStatus: string) => {
    onStatusChange(task, newStatus as BackendTaskStatus);
    // Fire notification to watchers
    const col = TASK_COLUMNS.find((c) => c.id === newStatus);
    watchers.forEach((w) => {
      if (w.user_id !== user?.id) {
        addNotification({
          type: 'success',
          title: `Task "${task.title}" moved`,
          message: `${user?.first_name ?? 'Someone'} moved it to ${col?.title ?? newStatus}.`,
          link: `/matters/${task.matter_id}`,
        });
      }
    });
  };

  return (
    <Sheet open={!!task} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-[520px] flex flex-col p-0 gap-0">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b">
          <SheetHeader>
            <SheetTitle className="text-left leading-snug pr-6">{task.title}</SheetTitle>
            <SheetDescription className="text-left">
              <button
                className="text-emerald-600 hover:underline dark:text-emerald-400 text-sm"
                onClick={() => { navigate(`/matters/${task.matter_id}`); onClose(); }}
              >
                {task.matter_reference_no} — {task.matter_title}
              </button>
            </SheetDescription>
          </SheetHeader>

          {/* Status + watch row */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Select value={task.status} onValueChange={handleStatusChange}>
              <SelectTrigger className="h-7 w-auto text-xs gap-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TASK_COLUMNS.map((c) => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
              </SelectContent>
            </Select>

            <Badge className={cn('border text-[11px]', PRIORITY_STYLE[task.priority])}>
              {task.priority}
            </Badge>

            {overdue && (
              <Badge className="border border-red-200 bg-red-50 text-red-700 text-[11px]">Overdue</Badge>
            )}

            <div className="flex-1" />

            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={isWatching ? 'default' : 'outline'}
                    size="sm"
                    className={cn('h-7 text-xs gap-1.5', isWatching && 'bg-emerald-600 hover:bg-emerald-700 text-white')}
                    onClick={handleToggleWatch}
                    disabled={togglingWatch}
                  >
                    {togglingWatch ? <Loader2 className="h-3 w-3 animate-spin" /> : isWatching ? <Bell className="h-3 w-3" /> : <BellOff className="h-3 w-3" />}
                    {isWatching ? 'Watching' : 'Watch'}
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="text-xs">{isWatching ? 'Stop watching this task' : 'Get notified of changes'}</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <Button
              size="sm"
              className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => { onEdit(task); onClose(); }}
            >
              Edit
            </Button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          <Tabs defaultValue="details" className="h-full">
            <TabsList className="w-full rounded-none border-b bg-transparent h-10 px-6">
              <TabsTrigger value="details" className="text-xs">Details</TabsTrigger>
              <TabsTrigger value="comments" className="text-xs">
                Comments {comments.length > 0 && `(${comments.length})`}
              </TabsTrigger>
              <TabsTrigger value="watchers" className="text-xs">
                Watchers {watchers.length > 0 && `(${watchers.length})`}
              </TabsTrigger>
            </TabsList>

            {/* ── Details tab ── */}
            <TabsContent value="details" className="mt-0 p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Client', value: task.client_name ?? '—' },
                  { label: 'Assigned To', value: assigneeName },
                  { label: 'Due Date', value: fmtDate(task.due_date), red: overdue },
                  { label: 'Created', value: fmtDate(task.created_at) },
                  { label: 'Last Updated', value: fmtDate(task.updated_at) },
                ].map(({ label, value, red }) => (
                  <div key={label}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
                    <p className={cn('mt-0.5 text-sm', red ? 'text-red-600 font-medium' : 'text-slate-700 dark:text-slate-300')}>{value}</p>
                  </div>
                ))}
              </div>

              {/* Time-in-column */}
              <div className="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 px-4 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-3.5 w-3.5 text-slate-400" />
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Time per column</p>
                </div>
                {TASK_COLUMNS.map((c) => (
                  <div key={c.id} className={cn('flex justify-between text-xs py-0.5', c.id === task.status ? 'font-semibold text-slate-900 dark:text-slate-100' : 'text-slate-400')}>
                    <span>{c.title}</span>
                    {c.id === task.status
                      ? <Badge className={cn('border text-[10px]', c.badgeCls)}>{estimateTimeInColumn(task)}</Badge>
                      : <span>—</span>}
                  </div>
                ))}
                <p className="mt-2 text-[10px] text-slate-400">Estimated from last status change</p>
              </div>

              {task.notes && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Notes</p>
                  <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{task.notes}</p>
                </div>
              )}
            </TabsContent>

            {/* ── Comments tab ── */}
            <TabsContent value="comments" className="mt-0 flex flex-col h-[calc(100vh-240px)]">
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                {loadingComments ? (
                  <div className="flex items-center gap-2 text-sm text-slate-400 py-4">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading comments…
                  </div>
                ) : comments.length === 0 ? (
                  <div className="text-center py-8 text-sm text-slate-400">
                    <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    No comments yet. Be the first!
                  </div>
                ) : (
                  comments.map((c) => (
                    <div key={c.id} className="flex gap-3 group">
                      <Avatar className="h-7 w-7 shrink-0 mt-0.5">
                        <AvatarFallback className="text-[10px] bg-emerald-100 text-emerald-700">
                          {initials(c.author_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{c.author_name}</span>
                          <span className="text-[10px] text-slate-400">{fmtRelative(c.created_at)}</span>
                          {c.author_id === user?.id && (
                            <button
                              className="ml-auto opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-opacity"
                              disabled={deletingCommentId === c.id}
                              onClick={() => void handleDeleteComment(c.id)}
                            >
                              {deletingCommentId === c.id
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : <Trash2 className="h-3 w-3" />}
                            </button>
                          )}
                        </div>
                        <p className="text-sm text-slate-700 dark:text-slate-300 mt-0.5 whitespace-pre-wrap">{c.body}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Select
                            value={noteTargetByComment[c.id] ?? 'none'}
                            onValueChange={(value) => setNoteTargetByComment((current) => ({
                              ...current,
                              [c.id]: value === 'none' ? '' : value,
                            }))}
                          >
                            <SelectTrigger className="h-7 w-[220px] text-xs">
                              <SelectValue placeholder={loadingNotes ? 'Loading notes…' : 'Add to related matter note'} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Select note</SelectItem>
                              {matterNotes.map((note) => (
                                <SelectItem key={note.id} value={note.id}>
                                  {note.title}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            disabled={!noteTargetByComment[c.id] || addingToNoteId === c.id}
                            onClick={() => void handleAddCommentToNote(c.id)}
                          >
                            {addingToNoteId === c.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                            Add to note
                          </Button>
                          {matterNotes.length === 0 && !loadingNotes && (
                            <span className="text-[10px] text-slate-400">Create a matter note first.</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
                <div ref={commentEndRef} />
              </div>

              {/* Comment composer */}
              <div className="border-t px-6 py-4 space-y-2">
                <Textarea
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  placeholder="Add a comment…"
                  rows={2}
                  className="text-sm resize-none"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      void handleSubmitComment();
                    }
                  }}
                />
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400">⌘↵ to submit</span>
                  <Button
                    size="sm"
                    className="h-7 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                    disabled={!commentBody.trim() || submitting}
                    onClick={() => void handleSubmitComment()}
                  >
                    {submitting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Send className="h-3 w-3 mr-1" />}
                    Comment
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* ── Watchers tab ── */}
            <TabsContent value="watchers" className="mt-0 p-6 space-y-4">
              {loadingWatchers ? (
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : watchers.length === 0 ? (
                <div className="text-center py-6 text-sm text-slate-400">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  No one is watching this task.
                </div>
              ) : (
                <div className="space-y-2">
                  {watchers.map((w) => (
                    <div key={w.user_id} className="flex items-center gap-3 rounded-lg border border-slate-100 dark:border-slate-800 p-2.5">
                      <Avatar className="h-7 w-7 shrink-0">
                        <AvatarFallback className="text-[10px] bg-emerald-100 text-emerald-700">{initials(w.full_name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{w.full_name}</p>
                        <p className="text-xs text-slate-400 truncate">{w.email}</p>
                      </div>
                      {w.user_id === user?.id && (
                        <Badge className="text-[10px] border border-emerald-200 bg-emerald-50 text-emerald-700">You</Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Add watcher */}
              <div>
                <Label className="text-xs text-slate-500 mb-1.5 block">Add team member as watcher</Label>
                <Select onValueChange={(v) => void handleAddWatcher(v)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select member…" />
                  </SelectTrigger>
                  <SelectContent>
                    {members
                      .filter((m) => !watchers.some((w) => w.user_id === m.id))
                      .map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <p className="text-[11px] text-slate-400">
                Watchers are notified when someone comments or changes the task status.
              </p>
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Task Form Dialog ──────────────────────────────────────────────────────────

function TaskFormDialog({
  open, onOpenChange, members, matters, initialState, saving, onSubmit,
}: {
  open: boolean; onOpenChange: (o: boolean) => void;
  members: MemberSummary[]; matters: BackendMatter[];
  initialState: TaskFormState; saving: boolean;
  onSubmit: (s: TaskFormState) => Promise<void>;
}) {
  const [state, setState] = useState<TaskFormState>(initialState);
  useEffect(() => { if (open) setState(initialState); }, [initialState, open]);
  const set = (p: Partial<TaskFormState>) => setState((s) => ({ ...s, ...p }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{state.taskId ? 'Edit Task' : 'New Task'}</DialogTitle>
          <DialogDescription>Save tasks against a matter.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void onSubmit(state); }}>
          <div className="space-y-2">
            <Label>Title</Label>
            <Input value={state.title} onChange={(e) => set({ title: e.target.value })} placeholder="Prepare compliance memo" />
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={state.notes} onChange={(e) => set({ notes: e.target.value })} rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Matter</Label>
              <Select value={state.matterId} onValueChange={(v) => set({ matterId: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {matters.map((m) => <SelectItem key={m.id} value={m.id}>{m.reference_no} – {m.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={state.priority} onValueChange={(v) => set({ priority: v as BackendTaskPriority })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Assigned To</Label>
              <Select value={state.assignedTo} onValueChange={(v) => set({ assignedTo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Due Date</Label>
              <Input type="date" value={state.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
            </div>
          </div>
          {state.taskId && (
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={state.status} onValueChange={(v) => set({ status: v as BackendTaskStatus })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TASK_COLUMNS.map((c) => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving || !state.title.trim()} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</> : state.taskId ? 'Save Changes' : 'Create Task'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <Card className="border-slate-200/80 dark:border-slate-700/80">
      <CardContent className="p-4">
        <p className="text-xs text-slate-500">{label}</p>
        <p className={cn('mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-50', accent)}>{value}</p>
      </CardContent>
    </Card>
  );
}

// ── Main KanbanPage ───────────────────────────────────────────────────────────

export function KanbanPage() {
  const { user } = useAuthStore();
  const { kanban, setKanbanFilters, clearKanbanFilters } = useFilterStore();
  const { addNotification } = useNotificationStore();

  const [matters, setMatters] = useState<BackendMatter[]>([]);
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [tasks, setTasks] = useState<EnrichedTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [taskDialogState, setTaskDialogState] = useState<TaskFormState>(emptyForm(''));
  const [savingTask, setSavingTask] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<EnrichedTask | null>(null);
  const [pendingDelete, setPendingDelete] = useState<EnrichedTask | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const loadBoard = useCallback(async (silent = false) => {
    if (silent) setIsRefreshing(true); else setIsLoading(true);
    setError(null);
    try {
      const [matterRes, memberRes] = await Promise.all([
        listMatters({ page_size: 100 }),
        listMembers(),
      ]);
      const activeMatters = matterRes.items.filter((m) => m.status !== 'archived');
      const taskResponses = await Promise.all(
        activeMatters.map((m) =>
          listMatterTasks(m.id, { page_size: 100 }).then((r) => ({ matter: m, items: r.items }))
        )
      );
      const merged: EnrichedTask[] = taskResponses.flatMap(({ matter, items }) =>
        items.map((t) => ({ ...t, matter_title: matter.title, matter_reference_no: matter.reference_no, client_name: matter.client?.name }))
      );
      setMatters(activeMatters);
      setMembers(memberRes.filter((m) => m.is_active));
      setTasks(merged);
    } catch (err) {
      setError(extractErrorMessage(err, 'Unable to load the task board.'));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadBoard(); }, []);

  const memberNameById = useMemo(() => new Map(members.map((m) => [m.id, m.full_name])), [members]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (kanban.myTasksOnly && t.assigned_to !== user?.id) return false;
      if (kanban.assigneeFilter !== 'all' && t.assigned_to !== kanban.assigneeFilter) return false;
      if (kanban.matterFilter !== 'all' && t.matter_id !== kanban.matterFilter) return false;
      if (kanban.search.trim()) {
        const q = kanban.search.toLowerCase();
        if (!t.title.toLowerCase().includes(q) && !t.notes?.toLowerCase().includes(q) &&
            !t.matter_title?.toLowerCase().includes(q) && !t.matter_reference_no?.toLowerCase().includes(q) &&
            !t.client_name?.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [tasks, kanban, user?.id]);

  const columns = useMemo(
    () => TASK_COLUMNS.map((col) => ({ ...col, tasks: filteredTasks.filter((t) => t.status === col.id) })),
    [filteredTasks]
  );

  const stats = useMemo(() => ({
    total: filteredTasks.length,
    todo: filteredTasks.filter((t) => t.status === 'todo').length,
    inProgress: filteredTasks.filter((t) => t.status === 'in_progress').length,
    done: filteredTasks.filter((t) => t.status === 'done').length,
  }), [filteredTasks]);

  const hasFilters = kanban.search || kanban.matterFilter !== 'all' || kanban.assigneeFilter !== 'all' || kanban.myTasksOnly;
  const activeTask = activeId ? tasks.find((t) => t.id === activeId) : null;

  // ── Drag handlers ─────────────────────────────────────────────────────────

  const handleDragStart = ({ active }: DragStartEvent) => setActiveId(String(active.id));

  const handleDragEnd = async ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over) return;
    const taskId = String(active.id);
    const newStatus = String(over.id) as BackendTaskStatus;
    if (!(['todo', 'in_progress', 'done', 'cancelled'] as string[]).includes(newStatus)) return;
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;

    setTasks((cur) => cur.map((t) => t.id === taskId ? { ...t, status: newStatus } : t));
    setBusyTaskId(taskId);
    try {
      const updated = await updateTask(task.matter_id, taskId, { status: newStatus });
      setTasks((cur) => cur.map((t) => t.id === taskId ? { ...updated, matter_title: task.matter_title, matter_reference_no: task.matter_reference_no, client_name: task.client_name } : t));
      const col = TASK_COLUMNS.find((c) => c.id === newStatus);
      toast.success(`Moved to ${col?.title ?? newStatus}`);
      // Notify (watchers notification happens in detail sheet; here we just toast)
    } catch (err) {
      setTasks((cur) => cur.map((t) => t.id === taskId ? { ...t, status: task.status } : t));
      handleApiError(err, 'Unable to update task status.');
    } finally {
      setBusyTaskId(null);
    }
  };

  // ── Task CRUD ─────────────────────────────────────────────────────────────

  const openCreate = (status: BackendTaskStatus = 'todo') => {
    setTaskDialogState({ ...emptyForm(matters[0]?.id ?? ''), status });
    setTaskDialogOpen(true);
  };

  const openEdit = (task: EnrichedTask) => {
    setTaskDialogState({
      taskId: task.id, matterId: task.matter_id, title: task.title,
      notes: task.notes ?? '', priority: task.priority,
      assignedTo: task.assigned_to ?? 'unassigned',
      dueDate: task.due_date ? task.due_date.slice(0, 10) : '',
      status: task.status,
    });
    setTaskDialogOpen(true);
  };

  const handleSubmit = async (state: TaskFormState) => {
    setSavingTask(true);
    try {
      const matter = matters.find((m) => m.id === state.matterId);
      if (state.taskId) {
        const updated = await updateTask(state.matterId, state.taskId, {
          title: state.title.trim(), notes: state.notes.trim() || undefined,
          priority: state.priority,
          assigned_to: state.assignedTo === 'unassigned' ? undefined : state.assignedTo,
          due_date: state.dueDate || undefined, status: state.status,
        });
        setTasks((cur) => cur.map((t) => t.id === updated.id
          ? { ...updated, matter_title: matter?.title, matter_reference_no: matter?.reference_no, client_name: matter?.client?.name }
          : t));
        toast.success('Task updated.');
        // Trigger notification
        addNotification({ type: 'success', title: `Task updated: ${state.title.trim()}`, message: `Status: ${state.status}, priority: ${state.priority}`, link: `/matters/${state.matterId}` });
      } else {
        const created = await createTask(state.matterId, {
          title: state.title.trim(), notes: state.notes.trim() || undefined,
          priority: state.priority,
          assigned_to: state.assignedTo === 'unassigned' ? undefined : state.assignedTo,
          due_date: state.dueDate || undefined,
        });
        setTasks((cur) => [{ ...created, matter_title: matter?.title, matter_reference_no: matter?.reference_no, client_name: matter?.client?.name }, ...cur]);
        toast.success('Task created.');
      }
      setTaskDialogOpen(false);
    } catch (err) {
      handleApiError(err, 'Unable to save task.');
    } finally {
      setSavingTask(false);
    }
  };

  const handleStatusChange = async (task: EnrichedTask, status: BackendTaskStatus) => {
    setBusyTaskId(task.id);
    try {
      const updated = await updateTask(task.matter_id, task.id, { status });
      setTasks((cur) => cur.map((t) => t.id === updated.id ? { ...updated, matter_title: t.matter_title, matter_reference_no: t.matter_reference_no, client_name: t.client_name } : t));
      // Update selectedTask if it's the same
      if (selectedTask?.id === task.id) setSelectedTask((prev) => prev ? { ...prev, status } : null);
      toast.success(`Moved to ${TASK_COLUMNS.find((c) => c.id === status)?.title}.`);
    } catch (err) {
      handleApiError(err, 'Unable to update task status.');
    } finally {
      setBusyTaskId(null);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setBusyTaskId(pendingDelete.id);
    try {
      await deleteTask(pendingDelete.matter_id, pendingDelete.id);
      setTasks((cur) => cur.filter((t) => t.id !== pendingDelete.id));
      if (selectedTask?.id === pendingDelete.id) setSelectedTask(null);
      toast.success('Task deleted.');
      setPendingDelete(null);
    } catch (err) {
      handleApiError(err, 'Unable to delete task.');
    } finally {
      setBusyTaskId(null);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <Card className="border-slate-200/80">
        <CardContent className="flex items-center gap-3 py-10">
          <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
          <span className="text-sm text-slate-500">Loading tasks…</span>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-slate-200/80">
        <CardContent className="space-y-4 py-8">
          <p className="text-sm text-slate-600">{error}</p>
          <Button variant="outline" onClick={() => void loadBoard()}>Try Again</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">Tasks</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''} · {new Set(filteredTasks.map((t) => t.matter_id)).size} matters
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => void loadBoard(true)} disabled={isRefreshing}>
            <RefreshCw className={cn('h-4 w-4 mr-2', isRefreshing && 'animate-spin')} /> Refresh
          </Button>
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => openCreate()}>
            <Plus className="h-4 w-4 mr-2" /> New Task
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total" value={stats.total} />
        <StatCard label="To Do" value={stats.todo} />
        <StatCard label="In Progress" value={stats.inProgress} accent="text-blue-600" />
        <StatCard label="Done" value={stats.done} accent="text-emerald-600" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <Button
          size="sm" variant={kanban.myTasksOnly ? 'default' : 'outline'}
          className={cn('h-8 text-xs', kanban.myTasksOnly && 'bg-emerald-600 hover:bg-emerald-700 text-white')}
          onClick={() => setKanbanFilters({ myTasksOnly: !kanban.myTasksOnly, assigneeFilter: 'all' })}
        >
          <Star className="h-3.5 w-3.5 mr-1.5" /> My Tasks
        </Button>
        <div className="relative min-w-[160px] flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input value={kanban.search} onChange={(e) => setKanbanFilters({ search: e.target.value })} placeholder="Search tasks…" className="pl-8 h-8 text-xs" />
        </div>
        <Select value={kanban.matterFilter} onValueChange={(v) => setKanbanFilters({ matterFilter: v })}>
          <SelectTrigger className="h-8 text-xs w-44">
            <Briefcase className="h-3.5 w-3.5 mr-2 text-slate-400 shrink-0" />
            <SelectValue placeholder="All Matters" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Matters</SelectItem>
            {matters.map((m) => <SelectItem key={m.id} value={m.id}>{m.reference_no} – {m.title}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={kanban.assigneeFilter} onValueChange={(v) => setKanbanFilters({ assigneeFilter: v, myTasksOnly: false })}>
          <SelectTrigger className="h-8 text-xs w-40">
            <User className="h-3.5 w-3.5 mr-2 text-slate-400 shrink-0" />
            <SelectValue placeholder="All Assignees" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Assignees</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>)}
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={clearKanbanFilters}>
            <X className="h-3.5 w-3.5 mr-1" /> Clear
          </Button>
        )}
      </div>

      {/* Board — min-w on each column ensures it scrolls before collapsing */}
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4 min-w-0">
          {columns.map((col) => (
            <KanbanColumn
              key={col.id} col={col} tasks={col.tasks} memberNameById={memberNameById}
              busyTaskId={busyTaskId} onEdit={openEdit} onDelete={setPendingDelete}
              onStatusChange={handleStatusChange} onCardClick={setSelectedTask} onAdd={openCreate}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={{ duration: 150, easing: 'ease' }}>
          {activeTask ? (
            <div className="rounded-lg border border-slate-200 bg-white dark:bg-slate-900 shadow-xl p-3 w-[260px] opacity-90 rotate-1 scale-105">
              <p className="text-sm font-medium">{activeTask.title}</p>
              {activeTask.client_name && <p className="text-xs text-slate-400 mt-0.5">{activeTask.client_name}</p>}
              <Badge className={cn('mt-2 border text-[10px]', PRIORITY_STYLE[activeTask.priority])}>{activeTask.priority}</Badge>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Task detail sheet */}
      <TaskDetailSheet
        task={selectedTask}
        memberNameById={memberNameById}
        members={members}
        onClose={() => setSelectedTask(null)}
        onEdit={openEdit}
        onStatusChange={handleStatusChange}
      />

      {/* Task form dialog */}
      <TaskFormDialog
        open={taskDialogOpen} onOpenChange={setTaskDialogOpen}
        members={members} matters={matters}
        initialState={taskDialogState} saving={savingTask} onSubmit={handleSubmit}
      />

      {/* Delete confirm */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete task?</AlertDialogTitle>
            <AlertDialogDescription>"{pendingDelete?.title}" will be permanently deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => void handleDelete()}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default KanbanPage;
