'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  useDroppable,
  closestCorners,
} from '@dnd-kit/core';
import { useDraggable } from '@dnd-kit/core';
import {
  AlertTriangle,
  Briefcase,
  Calendar,
  CheckCircle2,
  Circle,
  CircleDot,
  Clock,
  Filter,
  Loader2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Star,
  User,
  X,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { navigate } from '@/lib/router';
import { handleApiError, extractErrorMessage } from '@/lib/error-utils';
import { useAuthStore } from '@/lib/auth-store';
import { useFilterStore } from '@/lib/filter-store';
import { listMatters, type BackendMatter } from '@/lib/api/matters';
import { listMembers, type MemberSummary } from '@/lib/api/members';
import {
  createTask,
  deleteTask,
  listMatterTasks,
  listOverdueTasks,
  updateTask,
  type BackendTask,
  type BackendTaskPriority,
  type BackendTaskStatus,
} from '@/lib/api/tasks';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
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
  DropdownMenuTrigger,
  DropdownMenuSeparator,
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
  color: string;         // header accent
  cardColor: string;     // card border accent
  emptyColor: string;    // empty drop zone
  badgeColor: string;    // count badge
}[] = [
  {
    id: 'todo',
    title: 'To Do',
    icon: Circle,
    color: 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/50',
    cardColor: 'border-slate-200 dark:border-slate-700',
    emptyColor: 'border-slate-200 dark:border-slate-700',
    badgeColor: 'border-slate-200 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  },
  {
    id: 'in_progress',
    title: 'In Progress',
    icon: CircleDot,
    color: 'border-blue-200 bg-blue-50/60 dark:border-blue-800/50 dark:bg-blue-950/20',
    cardColor: 'border-blue-100 dark:border-blue-900/40',
    emptyColor: 'border-blue-200 dark:border-blue-800',
    badgeColor: 'border-blue-200 bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  },
  {
    id: 'done',
    title: 'Done',
    icon: CheckCircle2,
    color: 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-800/40 dark:bg-emerald-950/20',
    cardColor: 'border-emerald-100 dark:border-emerald-900/30',
    emptyColor: 'border-emerald-200 dark:border-emerald-800',
    badgeColor: 'border-emerald-200 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  },
  {
    id: 'cancelled',
    title: 'Cancelled',
    icon: XCircle,
    color: 'border-slate-200 bg-slate-50/40 dark:border-slate-800 dark:bg-slate-900/30',
    cardColor: 'border-slate-100 dark:border-slate-800 opacity-60',
    emptyColor: 'border-slate-200 dark:border-slate-700',
    badgeColor: 'border-slate-200 bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  },
];

const PRIORITY_STYLE: Record<BackendTaskPriority, string> = {
  low:    'border-slate-200 bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  medium: 'border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  high:   'border-red-200 bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(v?: string | null) {
  if (!v) return 'No due date';
  return new Date(v).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

function isOverdue(due?: string | null, status?: BackendTaskStatus) {
  if (!due || status === 'done' || status === 'cancelled') return false;
  return new Date(due) < new Date();
}

function emptyForm(defaultMatterId: string): TaskFormState {
  return { matterId: defaultMatterId, title: '', notes: '', priority: 'medium', assignedTo: 'unassigned', dueDate: '', status: 'todo' };
}

// Time-in-column calculator — tracks how long a task spent in its current status
// We don't have server-side per-column timestamps, so we estimate from updated_at
function estimateTimeInColumn(task: BackendTask): string {
  const ref = task.updated_at || task.created_at;
  const ms = Date.now() - new Date(ref).getTime();
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return '< 1 hour';
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

// ── Draggable Task Card ───────────────────────────────────────────────────────

function TaskCard({
  task,
  memberNameById,
  isBusy,
  onEdit,
  onDelete,
  onStatusChange,
  onClick,
  isDragging = false,
  columnCardColor,
}: {
  task: EnrichedTask;
  memberNameById: Map<string, string>;
  isBusy: boolean;
  onEdit: (t: EnrichedTask) => void;
  onDelete: (t: EnrichedTask) => void;
  onStatusChange: (t: EnrichedTask, s: BackendTaskStatus) => void;
  onClick: (t: EnrichedTask) => void;
  isDragging?: boolean;
  columnCardColor: string;
}) {
  const { attributes, listeners, setNodeRef, isDragging: localDrag } = useDraggable({ id: task.id });
  const overdue = isOverdue(task.due_date, task.status);

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        'group rounded-lg border p-3 bg-white dark:bg-slate-900 shadow-sm',
        'transition-all duration-150 select-none',
        'cursor-grab active:cursor-grabbing',
        columnCardColor,
        overdue && 'border-red-200 bg-red-50/40 dark:border-red-900/40 dark:bg-red-950/10',
        (localDrag || isDragging) && 'opacity-40 scale-95',
      )}
      onClick={(e) => {
        // Prevent click when dragging
        if (!localDrag) { e.stopPropagation(); onClick(task); }
      }}
    >
      {/* Header row */}
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className={cn('text-sm font-medium leading-snug', task.status === 'cancelled' && 'line-through text-slate-400')}>
            {task.title}
          </p>
          {/* Client name */}
          {task.client_name && (
            <p className="mt-0.5 text-[11px] text-slate-400 truncate">{task.client_name}</p>
          )}
          {/* Matter link */}
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); navigate(`/matters/${task.matter_id}`); }}
            className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-emerald-600 hover:underline dark:text-emerald-400"
          >
            <Briefcase className="h-2.5 w-2.5" />
            {task.matter_reference_no || 'View matter'}
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

      {/* Notes preview */}
      {task.notes && (
        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{task.notes}</p>
      )}

      {/* Footer */}
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
            {formatDate(task.due_date)}
            {overdue && <AlertTriangle className="h-2.5 w-2.5" />}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Droppable Column ──────────────────────────────────────────────────────────

function KanbanColumn({
  column,
  tasks,
  memberNameById,
  busyTaskId,
  onEdit,
  onDelete,
  onStatusChange,
  onCardClick,
  onAddTask,
}: {
  column: typeof TASK_COLUMNS[number];
  tasks: EnrichedTask[];
  memberNameById: Map<string, string>;
  busyTaskId: string | null;
  onEdit: (t: EnrichedTask) => void;
  onDelete: (t: EnrichedTask) => void;
  onStatusChange: (t: EnrichedTask, s: BackendTaskStatus) => void;
  onCardClick: (t: EnrichedTask) => void;
  onAddTask: (s: BackendTaskStatus) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const Icon = column.icon;

  return (
    <div className="flex flex-col min-w-[260px] max-w-xs w-full flex-1">
      {/* Column header */}
      <div className={cn('rounded-t-xl border border-b-0 px-3 py-2.5 flex items-center justify-between', column.color)}>
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-slate-500" />
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{column.title}</span>
        </div>
        <Badge className={cn('border text-xs tabular-nums', column.badgeColor)}>{tasks.length}</Badge>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={cn(
          'flex-1 rounded-b-xl border p-2 space-y-2 min-h-[200px] transition-colors duration-150',
          'bg-white dark:bg-slate-950',
          column.color,
          isOver && 'ring-2 ring-emerald-400 ring-offset-1',
        )}
      >
        <Button
          variant="ghost" size="sm"
          className="w-full h-8 text-xs text-slate-400 hover:text-slate-600 border border-dashed border-slate-200 dark:border-slate-700 hover:border-slate-400"
          onClick={() => onAddTask(column.id)}
        >
          <Plus className="h-3.5 w-3.5 mr-1" /> Add task
        </Button>

        {tasks.length === 0 ? (
          <div className={cn('rounded-lg border border-dashed p-5 text-center text-xs text-slate-400', column.emptyColor)}>
            Drop tasks here
          </div>
        ) : (
          tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              memberNameById={memberNameById}
              isBusy={busyTaskId === task.id}
              onEdit={onEdit}
              onDelete={onDelete}
              onStatusChange={onStatusChange}
              onClick={onCardClick}
              columnCardColor={column.cardColor}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── Task Detail Sheet ─────────────────────────────────────────────────────────

function TaskDetailSheet({
  task,
  memberNameById,
  onClose,
  onEdit,
}: {
  task: EnrichedTask | null;
  memberNameById: Map<string, string>;
  onClose: () => void;
  onEdit: (t: EnrichedTask) => void;
}) {
  if (!task) return null;
  const col = TASK_COLUMNS.find((c) => c.id === task.status)!;
  const overdue = isOverdue(task.due_date, task.status);

  return (
    <Sheet open={!!task} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="text-left">{task.title}</SheetTitle>
          <SheetDescription className="text-left">
            Task details and time tracking
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 pt-2">
          {/* Status + priority */}
          <div className="flex flex-wrap gap-2">
            <Badge className={cn('border text-xs', col.badgeColor)}>{col.title}</Badge>
            <Badge className={cn('border text-xs', PRIORITY_STYLE[task.priority])}>{task.priority} priority</Badge>
            {overdue && (
              <Badge className="border border-red-200 bg-red-50 text-red-700 text-xs">Overdue</Badge>
            )}
          </div>

          <Separator />

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Matter</p>
              <button
                className="mt-0.5 text-sm text-emerald-600 hover:underline dark:text-emerald-400 text-left"
                onClick={() => { navigate(`/matters/${task.matter_id}`); onClose(); }}
              >
                {task.matter_reference_no} — {task.matter_title}
              </button>
            </div>
            {task.client_name && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Client</p>
                <p className="mt-0.5 text-sm text-slate-700 dark:text-slate-300">{task.client_name}</p>
              </div>
            )}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Assigned To</p>
              <p className="mt-0.5 text-sm text-slate-700 dark:text-slate-300">
                {task.assigned_to ? (memberNameById.get(task.assigned_to) ?? 'Unknown') : 'Unassigned'}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Due Date</p>
              <p className={cn('mt-0.5 text-sm', overdue ? 'text-red-600 font-medium' : 'text-slate-700 dark:text-slate-300')}>
                {formatDate(task.due_date)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Created</p>
              <p className="mt-0.5 text-sm text-slate-700 dark:text-slate-300">{formatDate(task.created_at)}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Last Updated</p>
              <p className="mt-0.5 text-sm text-slate-700 dark:text-slate-300">{formatDate(task.updated_at)}</p>
            </div>
          </div>

          {/* Time in column */}
          <div className="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-slate-400" />
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Time per column (estimated)</p>
            </div>
            <div className="space-y-1">
              {TASK_COLUMNS.map((c) => (
                <div key={c.id} className={cn('flex items-center justify-between text-xs', c.id === task.status ? 'font-semibold text-slate-900 dark:text-slate-100' : 'text-slate-400')}>
                  <span>{c.title}</span>
                  {c.id === task.status ? (
                    <Badge className={cn('border text-[10px]', c.badgeColor)}>{estimateTimeInColumn(task)}</Badge>
                  ) : (
                    <span>—</span>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-slate-400">
              Time shown is since last status change. Per-column history requires server-side tracking.
            </p>
          </div>

          {/* Notes */}
          {task.notes && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Notes</p>
              <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{task.notes}</p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => { onEdit(task); onClose(); }}
            >
              Edit Task
            </Button>
            <Button variant="outline" onClick={onClose}>Close</Button>
          </div>
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
  const set = (patch: Partial<TaskFormState>) => setState((s) => ({ ...s, ...patch }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{state.taskId ? 'Edit Task' : 'Create Task'}</DialogTitle>
          <DialogDescription>Save tasks against a matter.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void onSubmit(state); }}>
          <div className="space-y-2">
            <Label htmlFor="t-title">Title</Label>
            <Input id="t-title" value={state.title} onChange={(e) => set({ title: e.target.value })} placeholder="Prepare compliance memo" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="t-notes">Notes</Label>
            <Textarea id="t-notes" value={state.notes} onChange={(e) => set({ notes: e.target.value })} rows={3} placeholder="Optional details or next steps" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Matter</Label>
              <Select value={state.matterId} onValueChange={(v) => set({ matterId: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {matters.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.reference_no} - {m.title}</SelectItem>
                  ))}
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
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
              <Label htmlFor="t-due">Due Date</Label>
              <Input id="t-due" type="date" value={state.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
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
              {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : (state.taskId ? 'Save Changes' : 'Create Task')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── StatCard ──────────────────────────────────────────────────────────────────

function StatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <Card className="border-slate-200/80 dark:border-slate-700/80">
      <CardContent className="p-4">
        <p className="text-xs text-slate-500">{label}</p>
        <p className={cn('mt-1 text-2xl font-bold text-slate-900 dark:text-slate-50 tabular-nums', accent)}>{value}</p>
      </CardContent>
    </Card>
  );
}

// ── Main KanbanPage ───────────────────────────────────────────────────────────

export function KanbanPage() {
  const { user } = useAuthStore();
  const { kanban, setKanbanFilters, clearKanbanFilters } = useFilterStore();

  const [matters, setMatters] = useState<BackendMatter[]>([]);
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [tasks, setTasks] = useState<EnrichedTask[]>([]);
  const [overdueCount, setOverdueCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [taskDialogState, setTaskDialogState] = useState<TaskFormState>(emptyForm(''));
  const [savingTask, setSavingTask] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<EnrichedTask | null>(null);
  const [pendingDelete, setPendingDelete] = useState<EnrichedTask | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const loadBoard = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    else setIsRefreshing(true);
    setError(null);
    try {
      const [matterRes, memberRes, overdueRes] = await Promise.all([
        listMatters({ page_size: 100 }),
        listMembers(),
        listOverdueTasks({ page_size: 100 }),
      ]);

      const activeMatters = matterRes.items.filter((m) => m.status !== 'archived');
      const taskResponses = await Promise.all(
        activeMatters.map((m) =>
          listMatterTasks(m.id, { page_size: 100 }).then((r) => ({ matter: m, items: r.items }))
        )
      );

      const merged: EnrichedTask[] = taskResponses.flatMap(({ matter, items }) =>
        items.map((t) => ({
          ...t,
          matter_title: matter.title,
          matter_reference_no: matter.reference_no,
          client_name: matter.client?.name,
        }))
      );

      setMatters(activeMatters);
      setMembers(memberRes.filter((m) => m.is_active));
      setTasks(merged);
      setOverdueCount(overdueRes.total);
      if (!taskDialogState.matterId && activeMatters[0]) {
        setTaskDialogState(emptyForm(activeMatters[0].id));
      }
    } catch (err) {
      setError(extractErrorMessage(err, 'Unable to load the task board.'));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [taskDialogState.matterId]);

  useEffect(() => { void loadBoard(); }, []);

  const memberNameById = useMemo(
    () => new Map(members.map((m) => [m.id, m.full_name])),
    [members]
  );

  const filteredTasks = useMemo(() => {
    const myId = user?.id;
    return tasks.filter((t) => {
      if (kanban.myTasksOnly && t.assigned_to !== myId) return false;
      if (kanban.assigneeFilter !== 'all' && t.assigned_to !== kanban.assigneeFilter) return false;
      if (kanban.matterFilter !== 'all' && t.matter_id !== kanban.matterFilter) return false;
      if (kanban.search.trim()) {
        const q = kanban.search.toLowerCase();
        if (
          !t.title.toLowerCase().includes(q) &&
          !t.notes?.toLowerCase().includes(q) &&
          !t.matter_title?.toLowerCase().includes(q) &&
          !t.matter_reference_no?.toLowerCase().includes(q) &&
          !t.client_name?.toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [tasks, kanban, user?.id]);

  const columns = useMemo(
    () => TASK_COLUMNS.map((col) => ({ ...col, tasks: filteredTasks.filter((t) => t.status === col.id) })),
    [filteredTasks]
  );

  // Stats against filtered tasks
  const stats = useMemo(() => ({
    total:      filteredTasks.length,
    todo:       filteredTasks.filter((t) => t.status === 'todo').length,
    inProgress: filteredTasks.filter((t) => t.status === 'in_progress').length,
    done:       filteredTasks.filter((t) => t.status === 'done').length,
  }), [filteredTasks]);

  const hasFilters = kanban.search || kanban.matterFilter !== 'all' || kanban.assigneeFilter !== 'all' || kanban.myTasksOnly;

  // ── Drag & drop handlers ─────────────────────────────────────────────────

  const handleDragStart = (event: DragStartEvent) => setActiveId(String(event.active.id));

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const taskId = String(active.id);
    const newStatus = String(over.id) as BackendTaskStatus;
    const validStatuses: BackendTaskStatus[] = ['todo', 'in_progress', 'done', 'cancelled'];
    if (!validStatuses.includes(newStatus)) return;

    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;

    // Optimistic update
    setTasks((cur) => cur.map((t) => t.id === taskId ? { ...t, status: newStatus } : t));
    setBusyTaskId(taskId);
    try {
      const updated = await updateTask(task.matter_id, taskId, { status: newStatus });
      setTasks((cur) => cur.map((t) => t.id === taskId ? {
        ...updated,
        matter_title: task.matter_title,
        matter_reference_no: task.matter_reference_no,
        client_name: task.client_name,
      } : t));
      const col = TASK_COLUMNS.find((c) => c.id === newStatus);
      toast.success(`Moved to ${col?.title ?? newStatus}`);
    } catch (err) {
      // Revert
      setTasks((cur) => cur.map((t) => t.id === taskId ? { ...t, status: task.status } : t));
      handleApiError(err, 'Unable to update task status.');
    } finally {
      setBusyTaskId(null);
    }
  };

  // ── Task CRUD ───────────────────────────────────────────────────────────

  const openCreate = (status: BackendTaskStatus = 'todo') => {
    setTaskDialogState({ ...emptyForm(matters[0]?.id || ''), status });
    setTaskDialogOpen(true);
  };

  const openEdit = (task: EnrichedTask) => {
    setTaskDialogState({
      taskId: task.id, matterId: task.matter_id, title: task.title,
      notes: task.notes || '', priority: task.priority,
      assignedTo: task.assigned_to || 'unassigned',
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
        setTasks((cur) => cur.map((t) => t.id === updated.id ? {
          ...updated, matter_title: matter?.title, matter_reference_no: matter?.reference_no,
          client_name: matter?.client?.name,
        } : t));
        toast.success('Task updated.');
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
      toast.success('Task deleted.');
      setPendingDelete(null);
    } catch (err) {
      handleApiError(err, 'Unable to delete task.');
    } finally {
      setBusyTaskId(null);
    }
  };

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) : null;

  // ── Render ───────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <Card className="border-slate-200/80"><CardContent className="flex items-center gap-3 py-10">
        <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
        <span className="text-sm text-slate-500">Loading tasks from all active matters…</span>
      </CardContent></Card>
    );
  }

  if (error) {
    return (
      <Card className="border-slate-200/80"><CardContent className="space-y-4 py-8">
        <p className="text-sm text-slate-600">{error}</p>
        <Button variant="outline" onClick={() => void loadBoard()}>Try Again</Button>
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">Tasks</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''} across {new Set(filteredTasks.map((t) => t.matter_id)).size} matters
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
        {/* My Tasks */}
        <Button
          size="sm"
          variant={kanban.myTasksOnly ? 'default' : 'outline'}
          className={cn('h-8 text-xs', kanban.myTasksOnly && 'bg-emerald-600 hover:bg-emerald-700 text-white')}
          onClick={() => setKanbanFilters({ myTasksOnly: !kanban.myTasksOnly, assigneeFilter: 'all' })}
        >
          <Star className="h-3.5 w-3.5 mr-1.5" />
          My Tasks
        </Button>

        {/* Search */}
        <div className="relative min-w-[180px] flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input
            value={kanban.search}
            onChange={(e) => setKanbanFilters({ search: e.target.value })}
            placeholder="Search tasks…"
            className="pl-8 h-8 text-xs"
          />
        </div>

        {/* Matter filter */}
        <Select value={kanban.matterFilter} onValueChange={(v) => setKanbanFilters({ matterFilter: v })}>
          <SelectTrigger className="h-8 text-xs w-44">
            <Briefcase className="h-3.5 w-3.5 mr-2 text-slate-400 shrink-0" />
            <SelectValue placeholder="All Matters" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Matters</SelectItem>
            {matters.map((m) => (
              <SelectItem key={m.id} value={m.id}>{m.reference_no} – {m.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Assignee filter */}
        <Select
          value={kanban.assigneeFilter}
          onValueChange={(v) => setKanbanFilters({ assigneeFilter: v, myTasksOnly: false })}
        >
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

        {/* Clear */}
        {hasFilters && (
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={clearKanbanFilters}>
            <X className="h-3.5 w-3.5 mr-1" /> Clear
          </Button>
        )}
      </div>

      {/* Kanban board — doesn't collapse until < 1000px, sidebar collapses instead */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4 min-w-0">
          {columns.map((col) => (
            <KanbanColumn
              key={col.id}
              column={col}
              tasks={col.tasks}
              memberNameById={memberNameById}
              busyTaskId={busyTaskId}
              onEdit={openEdit}
              onDelete={setPendingDelete}
              onStatusChange={handleStatusChange}
              onCardClick={setSelectedTask}
              onAddTask={openCreate}
            />
          ))}
        </div>

        {/* Drag overlay — ghost card that follows cursor */}
        <DragOverlay dropAnimation={{ duration: 150, easing: 'ease' }}>
          {activeTask ? (
            <div className="rounded-lg border border-slate-200 bg-white dark:bg-slate-900 shadow-xl p-3 w-[260px] opacity-95 rotate-1 scale-105 transition-transform">
              <p className="text-sm font-medium">{activeTask.title}</p>
              {activeTask.client_name && (
                <p className="text-xs text-slate-400 mt-0.5">{activeTask.client_name}</p>
              )}
              <Badge className={cn('mt-2 border text-[10px]', PRIORITY_STYLE[activeTask.priority])}>
                {activeTask.priority}
              </Badge>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Task detail sheet */}
      <TaskDetailSheet
        task={selectedTask}
        memberNameById={memberNameById}
        onClose={() => setSelectedTask(null)}
        onEdit={openEdit}
      />

      {/* Task form dialog */}
      <TaskFormDialog
        open={taskDialogOpen}
        onOpenChange={setTaskDialogOpen}
        members={members}
        matters={matters}
        initialState={taskDialogState}
        saving={savingTask}
        onSubmit={handleSubmit}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete task?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{pendingDelete?.title}&rdquo; will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => void handleDelete()}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default KanbanPage;
