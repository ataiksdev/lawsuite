'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpDown,
  Briefcase,
  Calendar,
  CheckCircle2,
  Circle,
  CircleDot,
  Loader2,
  MoreHorizontal,
  Plus,
  Search,
  User,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { navigate } from '@/lib/router';
import { ApiClientError } from '@/lib/api-client';
import { handleApiError, extractErrorMessage } from '@/lib/error-utils';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
} from '@/components/ui/dropdown-menu';

type EnrichedTask = BackendTask & {
  matter_title?: string;
  matter_reference_no?: string;
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

const TASK_COLUMNS: {
  id: BackendTaskStatus;
  title: string;
  icon: React.ElementType;
  badgeClass: string;
}[] = [
  { id: 'todo', title: 'To Do', icon: Circle, badgeClass: 'badge-todo' },
  { id: 'in_progress', title: 'In Progress', icon: CircleDot, badgeClass: 'badge-in_review' },
  { id: 'done', title: 'Done', icon: CheckCircle2, badgeClass: 'badge-done' },
  { id: 'cancelled', title: 'Cancelled', icon: XCircle, badgeClass: 'badge-archived' },
];

const PRIORITY_BADGES: Record<BackendTaskPriority, string> = {
  low: 'bg-slate-100 text-slate-600 border-slate-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  high: 'bg-red-100 text-red-700 border-red-200',
};

function formatDate(dateValue?: string | null) {
  if (!dateValue) {
    return 'No due date';
  }
  return new Date(dateValue).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function isOverdue(dateValue?: string | null, status?: BackendTaskStatus) {
  if (!dateValue || status === 'done' || status === 'cancelled') {
    return false;
  }
  return new Date(dateValue) < new Date();
}

function emptyFormState(defaultMatterId: string): TaskFormState {
  return {
    matterId: defaultMatterId,
    title: '',
    notes: '',
    priority: 'medium',
    assignedTo: 'unassigned',
    dueDate: '',
    status: 'todo',
  };
}

function TaskFormDialog({
  open,
  onOpenChange,
  members,
  matters,
  initialState,
  saving,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: MemberSummary[];
  matters: BackendMatter[];
  initialState: TaskFormState;
  saving: boolean;
  onSubmit: (state: TaskFormState) => Promise<void>;
}) {
  const [state, setState] = useState<TaskFormState>(initialState);

  useEffect(() => {
    if (open) {
      setState(initialState);
    }
  }, [initialState, open]);

  const isEdit = Boolean(state.taskId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Task' : 'Create Task'}</DialogTitle>
          <DialogDescription>
            Save tasks against a matter using the real backend.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void onSubmit(state);
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              value={state.title}
              onChange={(event) => setState((current) => ({ ...current, title: event.target.value }))}
              placeholder="Prepare compliance memo"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-notes">Notes</Label>
            <Textarea
              id="task-notes"
              value={state.notes}
              onChange={(event) => setState((current) => ({ ...current, notes: event.target.value }))}
              rows={4}
              placeholder="Optional details or next steps"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Matter</Label>
              <Select
                value={state.matterId}
                onValueChange={(value) => setState((current) => ({ ...current, matterId: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {matters.map((matter) => (
                    <SelectItem key={matter.id} value={matter.id}>
                      {matter.reference_no} - {matter.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Priority</Label>
              <Select
                value={state.priority}
                onValueChange={(value) =>
                  setState((current) => ({ ...current, priority: value as BackendTaskPriority }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
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
              <Select
                value={state.assignedTo}
                onValueChange={(value) => setState((current) => ({ ...current, assignedTo: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {members.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="task-due-date">Due Date</Label>
              <Input
                id="task-due-date"
                type="date"
                value={state.dueDate}
                onChange={(event) => setState((current) => ({ ...current, dueDate: event.target.value }))}
              />
            </div>
          </div>

          {isEdit && (
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={state.status}
                onValueChange={(value) =>
                  setState((current) => ({ ...current, status: value as BackendTaskStatus }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_COLUMNS.map((column) => (
                    <SelectItem key={column.id} value={column.id}>
                      {column.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving || !state.title.trim() || !state.matterId}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : isEdit ? (
                'Update Task'
              ) : (
                'Create Task'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function KanbanPage() {
  const [matters, setMatters] = useState<BackendMatter[]>([]);
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [tasks, setTasks] = useState<EnrichedTask[]>([]);
  const [overdueCount, setOverdueCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [matterFilter, setMatterFilter] = useState('all');
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [taskDialogState, setTaskDialogState] = useState<TaskFormState>(emptyFormState(''));
  const [savingTask, setSavingTask] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);

  const loadBoard = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [matterResponse, memberResponse, overdueResponse] = await Promise.all([
        listMatters({ page_size: 100 }),
        listMembers(),
        listOverdueTasks({ page_size: 100 }),
      ]);

      const activeMatters = matterResponse.items.filter((matter) => matter.status !== 'archived');
      const taskResponses = await Promise.all(
        activeMatters.map((matter) =>
          listMatterTasks(matter.id, { page_size: 100 }).then((response) => ({
            matter,
            items: response.items,
          }))
        )
      );

      const mergedTasks: EnrichedTask[] = taskResponses.flatMap(({ matter, items }) =>
        items.map((task) => ({
          ...task,
          matter_title: matter.title,
          matter_reference_no: matter.reference_no,
        }))
      );

      setMatters(activeMatters);
      setMembers(memberResponse.filter((member) => member.is_active));
      setTasks(mergedTasks);
      setOverdueCount(overdueResponse.total);
      setTaskDialogState(emptyFormState(activeMatters[0]?.id || ''));
    } catch (error) {
      setError(extractErrorMessage(error, 'Unable to load the task board.'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadBoard();
  }, []);

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const matchesSearch =
        !search.trim() ||
        task.title.toLowerCase().includes(search.toLowerCase()) ||
        task.notes?.toLowerCase().includes(search.toLowerCase()) ||
        task.matter_title?.toLowerCase().includes(search.toLowerCase()) ||
        task.matter_reference_no?.toLowerCase().includes(search.toLowerCase());
      const matchesMatter = matterFilter === 'all' || task.matter_id === matterFilter;
      return matchesSearch && matchesMatter;
    });
  }, [matterFilter, search, tasks]);

  const columns = useMemo(
    () =>
      TASK_COLUMNS.map((column) => ({
        ...column,
        tasks: filteredTasks.filter((task) => task.status === column.id),
      })),
    [filteredTasks]
  );

  const memberNameById = useMemo(
    () => new Map(members.map((member) => [member.id, member.full_name])),
    [members]
  );

  const openCreateDialog = (status: BackendTaskStatus = 'todo') => {
    setTaskDialogState({
      ...emptyFormState(matters[0]?.id || ''),
      status,
    });
    setTaskDialogOpen(true);
  };

  const openEditDialog = (task: EnrichedTask) => {
    setTaskDialogState({
      taskId: task.id,
      matterId: task.matter_id,
      title: task.title,
      notes: task.notes || '',
      priority: task.priority,
      assignedTo: task.assigned_to || 'unassigned',
      dueDate: task.due_date ? task.due_date.slice(0, 10) : '',
      status: task.status,
    });
    setTaskDialogOpen(true);
  };

  const handleTaskSubmit = async (state: TaskFormState) => {
    setSavingTask(true);
    try {
      if (state.taskId) {
        const updated = await updateTask(state.matterId, state.taskId, {
          title: state.title.trim(),
          notes: state.notes.trim() || undefined,
          priority: state.priority,
          assigned_to: state.assignedTo === 'unassigned' ? undefined : state.assignedTo,
          due_date: state.dueDate || undefined,
          status: state.status,
        });

        const matter = matters.find((entry) => entry.id === state.matterId);
        setTasks((current) =>
          current.map((task) =>
            task.id === updated.id
              ? {
                  ...updated,
                  matter_title: matter?.title,
                  matter_reference_no: matter?.reference_no,
                }
              : task
          )
        );
        toast.success('Task updated.');
      } else {
        const created = await createTask(state.matterId, {
          title: state.title.trim(),
          notes: state.notes.trim() || undefined,
          priority: state.priority,
          assigned_to: state.assignedTo === 'unassigned' ? undefined : state.assignedTo,
          due_date: state.dueDate || undefined,
        });
        const matter = matters.find((entry) => entry.id === state.matterId);
        setTasks((current) => [
          {
            ...created,
            matter_title: matter?.title,
            matter_reference_no: matter?.reference_no,
          },
          ...current,
        ]);
        toast.success('Task created.');
      }
      setTaskDialogOpen(false);
      const overdueResponse = await listOverdueTasks({ page_size: 100 });
      setOverdueCount(overdueResponse.total);
    } catch (error) {
      handleApiError(error, 'Unable to save task.');
    } finally {
      setSavingTask(false);
    }
  };

  const handleStatusChange = async (task: EnrichedTask, status: BackendTaskStatus) => {
    setBusyTaskId(task.id);
    try {
      const updated = await updateTask(task.matter_id, task.id, { status });
      setTasks((current) =>
        current.map((entry) =>
          entry.id === updated.id
            ? {
                ...updated,
                matter_title: entry.matter_title,
                matter_reference_no: entry.matter_reference_no,
              }
            : entry
        )
      );
      const overdueResponse = await listOverdueTasks({ page_size: 100 });
      setOverdueCount(overdueResponse.total);
      toast.success(`Task moved to ${TASK_COLUMNS.find((column) => column.id === status)?.title}.`);
    } catch (error) {
      handleApiError(error, 'Unable to update task status.');
    } finally {
      setBusyTaskId(null);
    }
  };

  const handleDeleteTask = async (task: EnrichedTask) => {
    setBusyTaskId(task.id);
    try {
      await deleteTask(task.matter_id, task.id);
      setTasks((current) => current.filter((entry) => entry.id !== task.id));
      const overdueResponse = await listOverdueTasks({ page_size: 100 });
      setOverdueCount(overdueResponse.total);
      toast.success('Task deleted.');
    } catch (error) {
      handleApiError(error, 'Unable to delete task.');
    } finally {
      setBusyTaskId(null);
    }
  };

  if (isLoading) {
    return (
      <Card className="border-slate-200/80 dark:border-slate-700/80">
        <CardContent className="flex items-center gap-3 py-10">
          <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
          <span className="text-sm text-slate-600 dark:text-slate-400">
            Loading tasks from all active matters...
          </span>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-slate-200/80 dark:border-slate-700/80">
        <CardContent className="space-y-4 py-8">
          <p className="text-sm text-slate-600 dark:text-slate-400">{error}</p>
          <Button variant="outline" onClick={() => void loadBoard()}>
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Task Board
          </h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Built from matter-scoped task endpoints and the overdue-org feed.
          </p>
        </div>
        <Button onClick={() => openCreateDialog()} className="bg-emerald-600 text-white hover:bg-emerald-700">
          <Plus className="mr-2 h-4 w-4" />
          New Task
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Total Tasks" value={filteredTasks.length} />
        <StatCard label="Overdue" value={overdueCount} accent="text-red-600" />
        <StatCard
          label="In Progress"
          value={filteredTasks.filter((task) => task.status === 'in_progress').length}
          accent="text-blue-600"
        />
        <StatCard
          label="Done"
          value={filteredTasks.filter((task) => task.status === 'done').length}
          accent="text-emerald-600"
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search tasks by title, notes, or matter..."
            className="pl-9"
          />
        </div>
        <div className="w-full sm:w-[320px]">
          <Select value={matterFilter} onValueChange={setMatterFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by matter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Matters</SelectItem>
              {matters.map((matter) => (
                <SelectItem key={matter.id} value={matter.id}>
                  {matter.reference_no} - {matter.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        {columns.map((column) => {
          const ColumnIcon = column.icon;
          return (
            <Card key={column.id} className="border-slate-200/80 dark:border-slate-700/80">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ColumnIcon className="h-4 w-4 text-slate-500" />
                    <CardTitle className="text-base font-semibold">{column.title}</CardTitle>
                  </div>
                  <Badge variant="outline" className={cn('text-xs', column.badgeClass)}>
                    {column.tasks.length}
                  </Badge>
                </div>
                <CardDescription className="text-xs">
                  {column.tasks.length === 0
                    ? 'No tasks in this column.'
                    : `${column.tasks.length} task${column.tasks.length === 1 ? '' : 's'}`}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => openCreateDialog(column.id)}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add to {column.title}
                </Button>

                {column.tasks.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    Nothing here yet.
                  </div>
                ) : (
                  column.tasks.map((task) => (
                    <div
                      key={task.id}
                      className={cn(
                        'space-y-3 rounded-lg border border-slate-100 p-3 dark:border-slate-800',
                        isOverdue(task.due_date, task.status) && 'border-red-200 bg-red-50/40 dark:border-red-900/40 dark:bg-red-950/10'
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {task.title}
                          </p>
                          <button
                            type="button"
                            onClick={() => navigate(`/matters/${task.matter_id}`)}
                            className="mt-1 inline-flex items-center gap-1 text-xs text-emerald-600 hover:underline"
                          >
                            <Briefcase className="h-3 w-3" />
                            {task.matter_reference_no || 'View matter'}
                          </button>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              {busyTaskId === task.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <MoreHorizontal className="h-4 w-4" />
                              )}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditDialog(task)}>
                              Edit Task
                            </DropdownMenuItem>
                            {TASK_COLUMNS.filter((entry) => entry.id !== task.status).map((entry) => (
                              <DropdownMenuItem
                                key={entry.id}
                                onClick={() => void handleStatusChange(task, entry.id)}
                              >
                                Move to {entry.title}
                              </DropdownMenuItem>
                            ))}
                            <DropdownMenuItem
                              className="text-red-600 focus:text-red-600"
                              onClick={() => void handleDeleteTask(task)}
                            >
                              Delete Task
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      {task.notes && (
                        <p className="text-sm text-slate-500 dark:text-slate-400">{task.notes}</p>
                      )}

                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={cn('border text-xs', PRIORITY_BADGES[task.priority])}>
                          {task.priority}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {task.matter_title || 'Matter'}
                        </Badge>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {task.assigned_to
                            ? memberNameById.get(task.assigned_to) || 'Assigned'
                            : 'Unassigned'}
                        </span>
                        <span
                          className={cn(
                            'inline-flex items-center gap-1',
                            isOverdue(task.due_date, task.status) && 'text-red-600'
                          )}
                        >
                          <Calendar className="h-3 w-3" />
                          {formatDate(task.due_date)}
                        </span>
                        {isOverdue(task.due_date, task.status) && (
                          <span className="inline-flex items-center gap-1 text-red-600">
                            <AlertTriangle className="h-3 w-3" />
                            Overdue
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <TaskFormDialog
        open={taskDialogOpen}
        onOpenChange={setTaskDialogOpen}
        members={members}
        matters={matters}
        initialState={taskDialogState}
        saving={savingTask}
        onSubmit={handleTaskSubmit}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <Card className="border-slate-200/80 dark:border-slate-700/80">
      <CardContent className="p-4">
        <p className="text-xs text-slate-500">{label}</p>
        <p className={cn('mt-1 text-2xl font-bold text-slate-900 dark:text-slate-50', accent)}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

export default KanbanPage;
