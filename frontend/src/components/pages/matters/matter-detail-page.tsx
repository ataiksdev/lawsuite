'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  CheckSquare,
  ChevronDown,
  ExternalLink,
  FilePlus2,
  FileText,
  FolderOpen,
  Building2,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  User,
  Wand2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { navigate, useRouteParams } from '@/lib/router';
import { ApiClientError } from '@/lib/api-client';
import { handleApiError, extractErrorMessage } from '@/lib/error-utils';
import {
  changeMatterStatus,
  getMatter,
  type BackendMatter,
  type BackendMatterStatus,
  type BackendMatterType,
} from '@/lib/api/matters';
import { listMembers, type MemberSummary } from '@/lib/api/members';
import {
  listMatterTasks,
  updateTask,
  createTask,
  deleteTask,
  type BackendTask,
  type BackendTaskStatus,
  type BackendTaskPriority,
} from '@/lib/api/tasks';
import {
  addDocumentVersion,
  deleteDocument,
  generateDocumentFromTemplate,
  getDocumentVersions,
  listDocuments,
  listDriveFiles,
  listTemplates,
  updateDocumentStatus,
  type BackendDocument,
  type BackendDocumentStatus,
  type BackendDocumentType,
  type BackendDocumentVersion,
  type DriveFileResponse,
  type TemplateFileResponse,
} from '@/lib/api/documents';
import { syncDriveFolder } from '@/lib/api/matters';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { DocumentFormDialog } from './components/document-form-dialog';
import { UploadDocumentDialog } from './components/upload-document-dialog';
import { LinkDriveFolderDialog } from './components/link-drive-folder-dialog';
import { MatterEventsSection } from './components/matter-events-section';
import { MatterNotesSection } from './components/matter-notes-section';

// ── Task section helpers ──────────────────────────────────────────────────────

const TASK_PRIORITY_STYLE: Record<BackendTaskPriority, string> = {
  low:    'border-slate-200 bg-slate-50 text-slate-600',
  medium: 'border-amber-200 bg-amber-50 text-amber-700',
  high:   'border-red-200 bg-red-50 text-red-700',
};

const TASK_STATUS_STYLE: Record<BackendTaskStatus, string> = {
  todo:        'border-slate-200 bg-slate-50 text-slate-600',
  in_progress: 'border-blue-200 bg-blue-50 text-blue-700',
  done:        'border-emerald-200 bg-emerald-50 text-emerald-700',
  cancelled:   'border-slate-200 bg-slate-100 text-slate-400',
};

function taskStatusLabel(s: BackendTaskStatus) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function MatterTasksSection({ matterId, members }: { matterId: string; members: MemberSummary[] }) {
  const [tasks, setTasks] = React.useState<BackendTask[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [showForm, setShowForm] = React.useState(false);
  const [newTitle, setNewTitle] = React.useState('');
  const [newPriority, setNewPriority] = React.useState<BackendTaskPriority>('medium');
  const [newAssignee, setNewAssignee] = React.useState('unassigned');
  const [savingNew, setSavingNew] = React.useState(false);
  const memberNameById = React.useMemo(() => new Map(members.map((m) => [m.id, m.full_name])), [members]);

  React.useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    listMatterTasks(matterId, { page_size: 100 })
      .then((r) => { if (!cancelled) setTasks(r.items); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [matterId]);

  const handleStatusChange = async (task: BackendTask, status: BackendTaskStatus) => {
    setBusyId(task.id);
    try {
      const updated = await updateTask(matterId, task.id, { status });
      setTasks((cur) => cur.map((t) => t.id === updated.id ? updated : t));
    } catch (e) {
      handleApiError(e, 'Unable to update task.');
    } finally {
      setBusyId(null);
    }
  };

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    setSavingNew(true);
    try {
      const created = await createTask(matterId, {
        title: newTitle.trim(), priority: newPriority,
        assigned_to: newAssignee === 'unassigned' ? undefined : newAssignee,
      });
      setTasks((cur) => [created, ...cur]);
      setNewTitle(''); setNewPriority('medium'); setNewAssignee('unassigned');
      setShowForm(false);
      toast.success('Task created.');
    } catch (e) {
      handleApiError(e, 'Unable to create task.');
    } finally {
      setSavingNew(false);
    }
  };

  const handleDelete = async (task: BackendTask) => {
    setBusyId(task.id);
    try {
      await deleteTask(matterId, task.id);
      setTasks((cur) => cur.filter((t) => t.id !== task.id));
      toast.success('Task deleted.');
    } catch (e) {
      handleApiError(e, 'Unable to delete task.');
    } finally {
      setBusyId(null);
    }
  };

  const todo = tasks.filter((t) => t.status === 'todo').length;
  const inProg = tasks.filter((t) => t.status === 'in_progress').length;
  const done = tasks.filter((t) => t.status === 'done').length;

  return (
    <Card className="shadow-sm lg:col-span-2">
      <CardContent className="space-y-4 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckSquare className="h-4 w-4 text-slate-500" />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-900 dark:text-slate-100">Tasks</h3>
            {!isLoading && (
              <div className="flex items-center gap-1 ml-1">
                <Badge className="text-[10px] border border-slate-200 bg-slate-100 text-slate-600">{todo} todo</Badge>
                <Badge className="text-[10px] border border-blue-200 bg-blue-50 text-blue-700">{inProg} in progress</Badge>
                <Badge className="text-[10px] border border-emerald-200 bg-emerald-50 text-emerald-700">{done} done</Badge>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate('/tasks')} className="text-xs h-8">
              Full Board
            </Button>
            <Button size="sm" className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setShowForm((v) => !v)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Task
            </Button>
          </div>
        </div>

        {showForm && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/10 p-4 space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Input className="sm:col-span-1 h-8 text-xs" placeholder="Task title…" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
              <Select value={newPriority} onValueChange={(v) => setNewPriority(v as BackendTaskPriority)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
              <Select value={newAssignee} onValueChange={setNewAssignee}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Assign to…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white" disabled={savingNew || !newTitle.trim()} onClick={() => void handleCreate()}>
                {savingNew ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null} Save Task
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-400 py-4">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading tasks…
          </div>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-slate-500">No tasks linked to this matter yet.</p>
        ) : (
          <div className="space-y-2">
            {tasks.map((task) => (
              <div key={task.id} className={cn('flex flex-col gap-2 sm:flex-row sm:items-center rounded-lg border p-3 transition-colors', task.status === 'done' ? 'opacity-60' : '')}>
                <div className="min-w-0 flex-1">
                  <p className={cn('text-sm font-medium text-slate-800 dark:text-slate-200', task.status === 'cancelled' && 'line-through text-slate-400')}>{task.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge className={cn('text-[10px] border', TASK_PRIORITY_STYLE[task.priority])}>{task.priority}</Badge>
                    {task.assigned_to && (
                      <span className="text-[11px] text-slate-400">{memberNameById.get(task.assigned_to) ?? 'Assigned'}</span>
                    )}
                    {task.due_date && (
                      <span className={cn('text-[11px]', new Date(task.due_date) < new Date() && task.status !== 'done' && task.status !== 'cancelled' ? 'text-red-500' : 'text-slate-400')}>
                        Due {formatDate(task.due_date)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Select
                    value={task.status}
                    disabled={busyId === task.id}
                    onValueChange={(v) => void handleStatusChange(task, v as BackendTaskStatus)}
                  >
                    <SelectTrigger className="h-7 w-[130px] text-xs">
                      {busyId === task.id ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todo">To Do</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="done">Done</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost" size="icon"
                    className="h-7 w-7 text-slate-300 hover:text-red-500"
                    disabled={busyId === task.id}
                    onClick={() => void handleDelete(task)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-NG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-NG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function statusBadgeClass(status: BackendMatterStatus): string {
  const map: Record<BackendMatterStatus, string> = {
    intake: 'badge-intake',
    open: 'badge-open',
    pending: 'badge-pending',
    in_review: 'badge-in_review',
    closed: 'badge-closed',
    archived: 'badge-archived',
  };
  return map[status];
}

function statusLabel(status: BackendMatterStatus): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function matterTypeBadgeClass(type: BackendMatterType): string {
  const map: Record<BackendMatterType, string> = {
    advisory:
      'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/30 dark:text-teal-300 dark:border-teal-800',
    litigation:
      'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800',
    compliance:
      'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/30 dark:text-purple-300 dark:border-purple-800',
    drafting:
      'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800',
    transactional:
      'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800',
  };
  return map[type];
}

function matterTypeLabel(type: BackendMatterType): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function documentTypeLabel(type: BackendDocumentType): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function documentStatusBadgeClass(status: BackendDocumentStatus): string {
  const map: Record<BackendDocumentStatus, string> = {
    draft: 'badge-todo',
    pending_signature: 'badge-pending',
    signed: 'badge-done',
    superseded: 'badge-archived',
  };
  return map[status];
}

function documentStatusLabel(status: BackendDocumentStatus): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

const STATUS_OPTIONS: BackendMatterStatus[] = [
  'intake',
  'open',
  'pending',
  'in_review',
  'closed',
  'archived',
];

const DOCUMENT_STATUS_OPTIONS: BackendDocumentStatus[] = [
  'draft',
  'pending_signature',
  'signed',
  'superseded',
];

const DOCUMENT_TYPE_OPTIONS: BackendDocumentType[] = [
  'engagement_letter',
  'memo',
  'contract',
  'filing',
  'correspondence',
  'report',
  'other',
];

function AddVersionDialog({
  open,
  onOpenChange,
  matterId,
  document,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matterId: string;
  document: BackendDocument | null;
  onSaved: (document: BackendDocument) => void;
}) {
  const [driveFileId, setDriveFileId] = useState('');
  const [driveUrl, setDriveUrl] = useState('');
  const [label, setLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setDriveFileId('');
      setDriveUrl('');
      setLabel('');
      setNotes('');
    }
  }, [open]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!document) {
      return;
    }

    setSaving(true);
    try {
      const updated = await addDocumentVersion(matterId, document.id, {
        drive_file_id: driveFileId.trim(),
        drive_url: driveUrl.trim(),
        label: label.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      onSaved(updated);
      toast.success(`Added version ${updated.current_version} to "${updated.name}".`);
      onOpenChange(false);
    } catch (error) {
      handleApiError(error, 'Unable to add document version.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Add Document Version</DialogTitle>
          <DialogDescription>
            Upload the next Drive-backed version for {document?.name || 'this document'}.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="version-drive-file-id">Google Drive File ID</Label>
            <Input
              id="version-drive-file-id"
              value={driveFileId}
              onChange={(event) => setDriveFileId(event.target.value)}
              placeholder="1aBcDeFgHiJkLmNoPqRsTuVwXyZ"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="version-drive-url">Drive URL</Label>
            <Input
              id="version-drive-url"
              value={driveUrl}
              onChange={(event) => setDriveUrl(event.target.value)}
              placeholder="https://drive.google.com/file/d/..."
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="version-label">Label</Label>
              <Input
                id="version-label"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="signed copy"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="version-notes">Notes</Label>
              <Input
                id="version-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Optional change notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving || !driveFileId.trim() || !driveUrl.trim()}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Add Version'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function GenerateTemplateDialog({
  open,
  onOpenChange,
  matterId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matterId: string;
  onSaved: (document: BackendDocument) => void;
}) {
  const [templates, setTemplates] = useState<TemplateFileResponse[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [documentName, setDocumentName] = useState('');
  const [documentType, setDocumentType] = useState<BackendDocumentType>('other');
  const [extraSubstitutions, setExtraSubstitutions] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setTemplates([]);
      setSelectedTemplateId('');
      setDocumentName('');
      setDocumentType('other');
      setExtraSubstitutions('');
      setError(null);
      return;
    }

    let cancelled = false;

    async function loadTemplates() {
      setLoading(true);
      setError(null);
      try {
        const response = await listTemplates(matterId);
        if (!cancelled) {
          setTemplates(response);
        }
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof ApiClientError ? err.detail : 'Unable to load templates.';
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadTemplates();
    return () => {
      cancelled = true;
    };
  }, [matterId, open]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);

    try {
      const parsedExtraSubstitutions = extraSubstitutions.trim()
        ? (JSON.parse(extraSubstitutions) as Record<string, string>)
        : {};

      const response = await generateDocumentFromTemplate(matterId, {
        template_file_id: selectedTemplateId,
        document_name: documentName.trim(),
        doc_type: documentType,
        extra_substitutions: parsedExtraSubstitutions,
      });
      onSaved(response);
      toast.success(`Generated "${response.name}" from template.`);
      onOpenChange(false);
    } catch (error) {
      // SyntaxError means the extra substitutions JSON was malformed — show as-is
      if (error instanceof SyntaxError) {
        handleApiError(new Error('Extra substitutions must be valid JSON.'), 'Invalid JSON.');
      } else {
        handleApiError(error, 'Unable to generate document from template.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Generate from Template</DialogTitle>
          <DialogDescription>
            Use a Google Docs template and link the generated file to this matter.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {loading ? (
            <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-4 text-sm text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
              Loading templates...
            </div>
          ) : error ? (
            <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950/20 dark:text-red-300">
              {error}
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Template</Label>
                <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((template) => (
                      <SelectItem key={template.file_id} value={template.file_id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="generated-document-name">Document Name</Label>
                  <Input
                    id="generated-document-name"
                    value={documentName}
                    onChange={(event) => setDocumentName(event.target.value)}
                    placeholder="Matter Status Memo"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Document Type</Label>
                  <Select
                    value={documentType}
                    onValueChange={(value) => setDocumentType(value as BackendDocumentType)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DOCUMENT_TYPE_OPTIONS.map((type) => (
                        <SelectItem key={type} value={type}>
                          {documentTypeLabel(type)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="extra-substitutions">Extra Substitutions</Label>
                <Textarea
                  id="extra-substitutions"
                  value={extraSubstitutions}
                  onChange={(event) => setExtraSubstitutions(event.target.value)}
                  placeholder={'{"{{lawyer_name}}":"Ada Obi","{{signatory_title}}":"Partner"}'}
                  rows={5}
                />
                <p className="text-xs text-slate-500">
                  Use JSON to add placeholders beyond the standard backend substitutions.
                </p>
              </div>
            </>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving || loading || !selectedTemplateId || !documentName.trim()}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Wand2 className="mr-2 h-4 w-4" />
                  Generate
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DriveFilesDialog({
  open,
  onOpenChange,
  matterId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matterId: string;
}) {
  const [files, setFiles] = useState<DriveFileResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    async function loadFiles() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await listDriveFiles(matterId);
        if (!cancelled) {
          setFiles(response);
        }
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof ApiClientError ? err.detail : 'Unable to load Drive files.';
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadFiles();

    return () => {
      cancelled = true;
    };
  }, [matterId, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>Drive Files</DialogTitle>
          <DialogDescription>
            Files currently visible inside this matter&apos;s Drive folder.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {isLoading ? (
            <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-4 text-sm text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
              Loading Drive files...
            </div>
          ) : error ? (
            <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950/20 dark:text-red-300">
              {error}
            </div>
          ) : files.length === 0 ? (
            <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              No Drive files were returned for this matter.
            </div>
          ) : (
            files.map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between gap-4 rounded-lg border border-slate-100 p-3 dark:border-slate-800"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                    {file.name}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {file.mime_type}
                    {file.modified_time ? ` · Updated ${formatDateTime(file.modified_time)}` : ''}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(file.web_view_link, '_blank', 'noopener,noreferrer')}
                >
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                  Open
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function MatterDetailPage() {
  const params = useRouteParams();
  const matterId = params.id;

  const [matter, setMatter] = useState<BackendMatter | null>(null);
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [documents, setDocuments] = useState<BackendDocument[]>([]);
  const [expandedDocumentId, setExpandedDocumentId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [isLinkFolderDialogOpen, setIsLinkFolderDialogOpen] = useState(false);
  const [isSyncingFolder, setIsSyncingFolder] = useState(false);
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [isGenerateDialogOpen, setIsGenerateDialogOpen] = useState(false);
  const [isDriveFilesDialogOpen, setIsDriveFilesDialogOpen] = useState(false);
  const [pendingDeleteDocument, setPendingDeleteDocument] = useState<BackendDocument | null>(null);
  const [selectedDocumentForVersion, setSelectedDocumentForVersion] = useState<BackendDocument | null>(null);
  const [isDeletingDocument, setIsDeletingDocument] = useState(false);
  const [updatingDocumentId, setUpdatingDocumentId] = useState<string | null>(null);

  useEffect(() => {
    if (!matterId) {
      setError('No matter id was provided.');
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function loadMatter() {
      setIsLoading(true);
      setError(null);
      setDocumentsError(null);

      try {
        const [matterResponse, memberResponse] = await Promise.all([
          getMatter(matterId),
          listMembers(),
        ]);

        if (!cancelled) {
          setMatter(matterResponse);
          setMembers(memberResponse.filter((member) => member.is_active));
        }

        try {
          const documentResponse = await listDocuments(matterId);
          if (!cancelled) {
            setDocuments(documentResponse);
          }
        } catch (documentError) {
          if (!cancelled) {
            const message =
              documentError instanceof ApiClientError
                ? documentError.detail
                : 'Unable to load document records for this matter.';
            setDocumentsError(message);
            setDocuments([]);
          }
        }
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof ApiClientError ? err.detail : 'Unable to load this matter.';
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadMatter();

    return () => {
      cancelled = true;
    };
  }, [matterId]);

  const assigneeName = useMemo(() => {
    if (!matter?.assigned_to) {
      return 'Unassigned';
    }
    return members.find((member) => member.id === matter.assigned_to)?.full_name || 'Assigned';
  }, [matter?.assigned_to, members]);

  const upsertDocument = (document: BackendDocument) => {
    setDocuments((current) => {
      const existingIndex = current.findIndex((entry) => entry.id === document.id);
      if (existingIndex === -1) {
        return [document, ...current];
      }

      const next = [...current];
      next[existingIndex] = document;
      return next;
    });
  };

  const handleDocumentSaved = (document: BackendDocument) => {
    upsertDocument(document);
    setDocumentsError(null);
    setIsLinkDialogOpen(false);
    setIsGenerateDialogOpen(false);
  };

  const handleDocumentStatusChange = async (
    document: BackendDocument,
    nextStatus: BackendDocumentStatus
  ) => {
    if (!matter || nextStatus === document.status) {
      return;
    }

    setUpdatingDocumentId(document.id);
    try {
      const updated = await updateDocumentStatus(matter.id, document.id, nextStatus);
      upsertDocument(updated);
      toast.success(`Updated "${updated.name}" to ${documentStatusLabel(updated.status)}.`);
    } catch (error) {
      handleApiError(error, 'Unable to update document status.');
    } finally {
      setUpdatingDocumentId(null);
    }
  };

  const handleExpandDocument = async (documentId: string) => {
    if (!matter) {
      return;
    }

    if (expandedDocumentId === documentId) {
      setExpandedDocumentId(null);
      return;
    }

    setExpandedDocumentId(documentId);
    try {
      const versions = await getDocumentVersions(matter.id, documentId);
      setDocuments((current) =>
        current.map((entry) =>
          entry.id === documentId ? { ...entry, versions } : entry
        )
      );
    } catch (error) {
      const message =
        error instanceof ApiClientError ? error.detail : 'Unable to load document versions.';
      toast.error(message);
    }
  };

  const handleDeleteDocument = async () => {
    if (!matter || !pendingDeleteDocument) {
      return;
    }

    setIsDeletingDocument(true);
    try {
      await deleteDocument(matter.id, pendingDeleteDocument.id);
      setDocuments((current) =>
        current.filter((entry) => entry.id !== pendingDeleteDocument.id)
      );
      toast.success(`"${pendingDeleteDocument.name}" removed from this matter.`);
      setPendingDeleteDocument(null);
    } catch (error) {
      handleApiError(error, 'Unable to remove document.');
    } finally {
      setIsDeletingDocument(false);
    }
  };

  const handleStatusChange = async (nextStatus: BackendMatterStatus) => {
    if (!matter || nextStatus === matter.status) {
      return;
    }

    setIsUpdatingStatus(true);
    try {
      const updatedMatter = await changeMatterStatus(matter.id, { status: nextStatus });
      setMatter(updatedMatter);
      toast.success(`Matter moved to ${statusLabel(updatedMatter.status)}.`);
    } catch (err) {
      handleApiError(err, 'Unable to change matter status.');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleSyncFolder = async () => {
    if (!matter?.drive_folder_id) return;
    setIsSyncingFolder(true);
    try {
      const result = await syncDriveFolder(matter.id);
      if (result.imported_count > 0) {
        // Reload the document list to show newly imported files
        const updated = await listDocuments(matter.id);
        setDocuments(updated);
        toast.success(`Synced — ${result.imported_count} new document${result.imported_count !== 1 ? 's' : ''} imported.`);
      } else {
        toast.success('Folder synced — no new files found.');
      }
    } catch (err) {
      handleApiError(err, 'Unable to sync Drive folder.');
    } finally {
      setIsSyncingFolder(false);
    }
  };

  if (isLoading) {
    return (
      <Card className="shadow-sm">
        <CardContent className="flex items-center gap-3 py-10">
          <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
          <span className="text-sm text-slate-600 dark:text-slate-400">
            Loading matter details...
          </span>
        </CardContent>
      </Card>
    );
  }

  if (error || !matter) {
    return (
      <Card className="shadow-sm">
        <CardContent className="space-y-4 py-8">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {error || 'Matter not found.'}
          </p>
          <Button variant="outline" onClick={() => navigate('/matters')}>
            Back to Matters
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/matters')}
            className="mt-0.5 h-9 w-9 shrink-0 text-slate-500 hover:text-slate-700"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-sm font-medium text-slate-500 dark:text-slate-400">
                {matter.reference_no}
              </span>
              <Badge variant="outline" className={cn('border text-xs', statusBadgeClass(matter.status))}>
                {statusLabel(matter.status)}
              </Badge>
              <Badge
                variant="outline"
                className={cn('border text-xs', matterTypeBadgeClass(matter.matter_type))}
              >
                {matterTypeLabel(matter.matter_type)}
              </Badge>
            </div>
            <h1 className="page-title mt-1">{matter.title}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
              {matter.client && (
                <span className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
                  <Building2 className="h-3.5 w-3.5" />
                  <span>{matter.client.name}</span>
                </span>
              )}
              <span className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
                <User className="h-3.5 w-3.5" />
                <span>{assigneeName}</span>
              </span>
              <span className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
                <Calendar className="h-3.5 w-3.5" />
                <span>Opened {formatDate(matter.opened_at)}</span>
              </span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Select
            value={matter.status}
            onValueChange={(value) => void handleStatusChange(value as BackendMatterStatus)}
            disabled={isUpdatingStatus}
          >
            <SelectTrigger className="h-9 w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((status) => (
                <SelectItem key={status} value={status}>
                  {statusLabel(status)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/matters/${matter.id}/edit`)}
            className="h-9"
          >
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            Edit
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="card-legal">
          <CardContent className="p-4">
            <p className="stat-label">Opened</p>
            <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
              {formatDate(matter.opened_at)}
            </p>
          </CardContent>
        </Card>
        <Card className="card-legal">
          <CardContent className="p-4">
            <p className="stat-label">Target Close</p>
            <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
              {matter.target_close_at ? formatDate(matter.target_close_at) : 'Not set'}
            </p>
          </CardContent>
        </Card>
        <Card className="card-legal">
          <CardContent className="p-4">
            <p className="stat-label">Last Updated</p>
            <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
              {formatDate(matter.updated_at)}
            </p>
          </CardContent>
        </Card>
      </div>

      {matter.description && (
        <Card className="shadow-sm">
          <CardContent className="space-y-4 p-6">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-900 dark:text-slate-100">
              Description
            </h3>
            <p className="text-sm leading-6 text-slate-700 dark:text-slate-300">
              {matter.description}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="shadow-sm lg:col-span-2">
          <CardContent className="p-4">
            <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Matter Details</p>
                <DetailRow label="Reference" value={matter.reference_no} />
                <DetailRow label="Type" value={matterTypeLabel(matter.matter_type)} />
                <DetailRow label="Status" value={statusLabel(matter.status)} />
                <DetailRow label="Assigned To" value={assigneeName} />
              </div>
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Record Info</p>
                <DetailRow label="Created" value={formatDateTime(matter.created_at)} />
                <DetailRow label="Opened" value={formatDateTime(matter.opened_at)} />
                <DetailRow label="Closed" value={matter.closed_at ? formatDateTime(matter.closed_at) : 'Not closed'} />
              </div>
            </div>
          </CardContent>
        </Card>

        <MatterTasksSection matterId={matter.id} members={members} />

        <MatterEventsSection matterId={matter.id} />

        <MatterNotesSection matterId={matter.id} />

        <Card className="shadow-sm lg:col-span-2">
          <CardContent className="space-y-4 p-6">
            <div className="flex flex-col gap-3">
              {/* ── Folder status + title row ── */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-slate-500" />
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-900 dark:text-slate-100">
                    Documents
                  </h3>
                </div>
                {matter.drive_folder_id ? (
                  <div className="flex items-center gap-1.5">
                    <Badge className="text-[10px] border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300">
                      Drive folder linked
                    </Badge>
                    {matter.drive_folder_url && (
                      <a
                        href={matter.drive_folder_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-400 hover:text-emerald-600"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                ) : null}
              </div>

              {/* ── Toolbar ── */}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsLinkFolderDialogOpen(true)}
                  className={cn(
                    'h-8 text-xs',
                    matter.drive_folder_id
                      ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/20'
                      : ''
                  )}
                >
                  <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
                  {matter.drive_folder_id ? 'Manage Folder' : 'Link Drive Folder'}
                </Button>
                {matter.drive_folder_id && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    disabled={isSyncingFolder}
                    onClick={() => void handleSyncFolder()}
                  >
                    <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', isSyncingFolder && 'animate-spin')} />
                    Sync Files
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => setIsDriveFilesDialogOpen(true)}>
                  <ExternalLink className="mr-1.5 h-4 w-4" />
                  Browse Drive
                </Button>
                <Button variant="outline" size="sm" onClick={() => setIsGenerateDialogOpen(true)}>
                  <Wand2 className="mr-1.5 h-4 w-4" />
                  From Template
                </Button>
                <Button variant="outline" size="sm" onClick={() => setIsLinkDialogOpen(true)}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  Link by ID
                </Button>
                <Button
                  size="sm"
                  onClick={() => setIsUploadDialogOpen(true)}
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  <Upload className="mr-1.5 h-4 w-4" />
                  Upload File
                </Button>
              </div>
            </div>

            {documentsError ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">{documentsError}</p>
            ) : documents.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No documents are linked to this matter yet.
              </p>
            ) : (
              <div className="space-y-3">
                {documents.map((document) => {
                  const isExpanded = expandedDocumentId === document.id;
                  const latestVersion =
                    [...document.versions].sort((a, b) => b.version_number - a.version_number)[0];

                  return (
                    <Collapsible
                      key={document.id}
                      open={isExpanded}
                      onOpenChange={() => void handleExpandDocument(document.id)}
                    >
                      <div className="rounded-lg border border-slate-100 p-4 dark:border-slate-800">
                        <div className="flex flex-col gap-3">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                                {document.name}
                              </p>
                              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                                <Badge variant="outline" className="border text-[10px]">
                                  {documentTypeLabel(document.doc_type)}
                                </Badge>
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    'border text-[10px]',
                                    documentStatusBadgeClass(document.status)
                                  )}
                                >
                                  {documentStatusLabel(document.status)}
                                </Badge>
                                <span className="text-xs text-slate-400">v{document.current_version}</span>
                                <span className="text-xs text-slate-400">
                                  {document.versions.length} version{document.versions.length === 1 ? '' : 's'}
                                </span>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Select
                                value={document.status}
                                onValueChange={(value) =>
                                  void handleDocumentStatusChange(
                                    document,
                                    value as BackendDocumentStatus
                                  )
                                }
                                disabled={updatingDocumentId === document.id}
                              >
                                <SelectTrigger className="h-8 w-[170px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {DOCUMENT_STATUS_OPTIONS.map((status) => (
                                    <SelectItem key={status} value={status}>
                                      {documentStatusLabel(status)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {document.drive_url && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    window.open(document.drive_url || '', '_blank', 'noopener,noreferrer')
                                  }
                                >
                                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                                  Open
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setSelectedDocumentForVersion(document)}
                              >
                                <FilePlus2 className="mr-1.5 h-3.5 w-3.5" />
                                Add Version
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-red-600 hover:bg-red-50 hover:text-red-700"
                                onClick={() => setPendingDeleteDocument(document)}
                              >
                                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                                Remove
                              </Button>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                            <span>Added {formatDateTime(document.added_at)}</span>
                            <span>Updated {formatDateTime(document.updated_at)}</span>
                            {latestVersion?.label && <span>Latest label: {latestVersion.label}</span>}
                          </div>

                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="sm" className="w-fit px-0 text-slate-500">
                              <ChevronDown
                                className={cn(
                                  'mr-1.5 h-4 w-4 transition-transform',
                                  isExpanded && 'rotate-180'
                                )}
                              />
                              {isExpanded ? 'Hide version history' : 'Show version history'}
                            </Button>
                          </CollapsibleTrigger>

                          <CollapsibleContent className="space-y-3 pt-2">
                            {document.versions.length === 0 ? (
                              <p className="text-sm text-slate-500">No version history available yet.</p>
                            ) : (
                              [...document.versions]
                                .sort((a, b) => b.version_number - a.version_number)
                                .map((version: BackendDocumentVersion) => (
                                  <div
                                    key={version.id}
                                    className="flex flex-col gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-900"
                                  >
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                      <div>
                                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                          Version {version.version_number}
                                        </p>
                                        <p className="text-xs text-slate-500">
                                          Uploaded {formatDateTime(version.uploaded_at)}
                                        </p>
                                      </div>
                                      <div className="flex flex-wrap gap-2">
                                        {version.label && (
                                          <Badge variant="outline" className="text-[10px]">
                                            {version.label}
                                          </Badge>
                                        )}
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() =>
                                            window.open(version.drive_url, '_blank', 'noopener,noreferrer')
                                          }
                                        >
                                          <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                                          Open Version
                                        </Button>
                                      </div>
                                    </div>
                                    {version.notes && (
                                      <p className="text-sm text-slate-600 dark:text-slate-400">
                                        {version.notes}
                                      </p>
                                    )}
                                  </div>
                                ))
                            )}
                          </CollapsibleContent>
                        </div>
                      </div>
                    </Collapsible>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <DocumentFormDialog
        open={isLinkDialogOpen}
        onOpenChange={setIsLinkDialogOpen}
        matterId={matter.id}
        onSave={handleDocumentSaved}
      />

      <UploadDocumentDialog
        open={isUploadDialogOpen}
        onOpenChange={setIsUploadDialogOpen}
        matterId={matter.id}
        onUploaded={(doc) => {
          upsertDocument(doc);
          setDocumentsError(null);
        }}
      />

      <LinkDriveFolderDialog
        open={isLinkFolderDialogOpen}
        onOpenChange={setIsLinkFolderDialogOpen}
        matterId={matter.id}
        existingFolderId={matter.drive_folder_id}
        existingFolderUrl={matter.drive_folder_url}
        onLinked={async (info) => {
          // Update the matter record with the new folder ID + URL
          setMatter((prev) => prev ? {
            ...prev,
            drive_folder_id: info.folder_id,
            drive_folder_url: info.folder_url,
          } : prev);
          // Reload documents to show anything that was imported
          if (info.imported_count > 0) {
            const updated = await listDocuments(matter.id);
            setDocuments(updated);
            toast.success(
              `Folder linked — ${info.imported_count} document${info.imported_count !== 1 ? 's' : ''} imported.`
            );
          } else {
            toast.success('Drive folder linked successfully.');
          }
        }}
      />

      <GenerateTemplateDialog
        open={isGenerateDialogOpen}
        onOpenChange={setIsGenerateDialogOpen}
        matterId={matter.id}
        onSaved={handleDocumentSaved}
      />

      <DriveFilesDialog
        open={isDriveFilesDialogOpen}
        onOpenChange={setIsDriveFilesDialogOpen}
        matterId={matter.id}
      />

      <AddVersionDialog
        open={!!selectedDocumentForVersion}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedDocumentForVersion(null);
          }
        }}
        matterId={matter.id}
        document={selectedDocumentForVersion}
        onSaved={(document) => {
          upsertDocument(document);
          setSelectedDocumentForVersion(null);
        }}
      />

      <AlertDialog
        open={!!pendingDeleteDocument}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDeleteDocument(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Document</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDeleteDocument
                ? `Remove "${pendingDeleteDocument.name}" from this matter? The backend keeps the Drive file, but it will no longer appear in the matter document list.`
                : 'Remove this document from the matter?'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingDocument}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDeleteDocument()}
              disabled={isDeletingDocument}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeletingDocument ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Removing...
                </>
              ) : (
                'Remove'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium text-slate-400 dark:text-slate-500">{label}</span>
      <span className="text-sm text-slate-700 dark:text-slate-300">{value || '—'}</span>
    </div>
  );
}

export default MatterDetailPage;
