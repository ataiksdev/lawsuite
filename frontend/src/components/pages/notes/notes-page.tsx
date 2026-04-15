'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Loader2,
  NotebookPen,
  PenLine,
  Plus,
  Search,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import { handleApiError } from '@/lib/error-utils';
import { listMatters, type BackendMatter } from '@/lib/api/matters';
import { listCalendarEvents, type BackendCalendarEvent } from '@/lib/api/calendar';
import {
  createNote,
  deleteNote,
  listNotes,
  updateNote,
  type BackendNote,
  type NoteType,
} from '@/lib/api/notes';
import { SvgSketchpad } from '@/components/shared/svg-sketchpad';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function typeIcon(type: NoteType) {
  if (type === 'handwritten') return <PenLine className="h-3.5 w-3.5" />;
  if (type === 'mixed') return <NotebookPen className="h-3.5 w-3.5" />;
  return <Type className="h-3.5 w-3.5" />;
}

function typeBadgeClass(type: NoteType) {
  if (type === 'handwritten') return 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/20 dark:text-violet-300';
  if (type === 'mixed') return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/20 dark:text-blue-300';
  return 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400';
}

function svgDataUrl(svg: string) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function formatRelative(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-NG', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Note card ─────────────────────────────────────────────────────────────────

function NoteCard({
  note,
  matterTitle,
  onDelete,
  onSelect,
  isSelected,
}: {
  note: BackendNote;
  matterTitle?: string;
  onDelete: () => void;
  onSelect: () => void;
  isSelected: boolean;
}) {
  return (
    <div
      className={cn(
        'group relative rounded-xl border p-4 cursor-pointer transition-all',
        isSelected
          ? 'border-emerald-400 bg-emerald-50/60 dark:border-emerald-700 dark:bg-emerald-950/20 shadow-sm'
          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-950/30'
      )}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate flex-1">
          {note.title}
        </p>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 shrink-0 -mt-0.5"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <Badge className={cn('text-[10px] flex items-center gap-1 border', typeBadgeClass(note.note_type))}>
          {typeIcon(note.note_type)}
          {note.note_type}
        </Badge>
        {matterTitle && (
          <Badge className="text-[10px] border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300">
            {matterTitle}
          </Badge>
        )}
      </div>

      {note.body && (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
          {note.body}
        </p>
      )}
      {note.svg_content && !note.body && (
        <div className="mt-2 rounded-lg overflow-hidden border border-slate-100 dark:border-slate-800 bg-white">
          <img
            src={svgDataUrl(note.svg_content)}
            alt="Handwritten note preview"
            className="max-h-20 w-full object-contain"
          />
        </div>
      )}

      <p className="mt-2 text-[10px] text-slate-400">
        {note.author_name} · {formatRelative(note.updated_at)}
      </p>
    </div>
  );
}

// ── Note viewer / editor ──────────────────────────────────────────────────────

function NoteViewer({
  note,
  matters,
  events,
  onUpdated,
  onClose,
}: {
  note: BackendNote;
  matters: BackendMatter[];
  events: BackendCalendarEvent[];
  onUpdated: (note: BackendNote) => void;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body ?? '');
  const [svgContent, setSvgContent] = useState(note.svg_content ?? '');
  const [matterId, setMatterId] = useState(note.matter_id ?? 'none');
  const [eventId, setEventId] = useState(note.event_id ?? 'none');

  // Reset local state when a different note is selected
  useEffect(() => {
    setEditing(false);
    setTitle(note.title);
    setBody(note.body ?? '');
    setSvgContent(note.svg_content ?? '');
    setMatterId(note.matter_id ?? 'none');
    setEventId(note.event_id ?? 'none');
  }, [note.id]);

  const matterEvents = useMemo(
    () => matterId !== 'none' ? events.filter((e) => e.matter_id === matterId) : events,
    [events, matterId]
  );

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const updated = await updateNote(note.id, {
        title: title.trim(),
        body: body.trim() || undefined,
        svg_content: svgContent.trim() || undefined,
        matter_id: matterId !== 'none' ? matterId : null,
        event_id: eventId !== 'none' ? eventId : null,
      });
      onUpdated(updated);
      setEditing(false);
      toast.success('Note saved.');
    } catch (err) {
      handleApiError(err, 'Unable to save note.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {/* Back button visible only on mobile (xl hides when left panel is visible) */}
          <Button
            size="icon"
            variant="ghost"
            className="xl:hidden h-8 w-8 text-slate-400 shrink-0"
            onClick={onClose}
          >
            <X className="h-4 w-4 rotate-0" />
          </Button>
          <div className="min-w-0 flex-1">
            {editing ? (
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="text-lg font-semibold h-auto py-1 px-2"
                autoFocus
              />
            ) : (
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 truncate">
                {note.title}
              </h2>
            )}
            <p className="text-xs text-slate-400 mt-0.5">
              {note.author_name} · Updated {formatRelative(note.updated_at)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {editing ? (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setEditing(false); setTitle(note.title); setBody(note.body ?? ''); setSvgContent(note.svg_content ?? ''); }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={saving || !title.trim() || (!body.trim() && !svgContent.trim())}
                onClick={() => void handleSave()}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                Save
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              Edit
            </Button>
          )}
          <Button size="icon" variant="ghost" className="hidden xl:flex h-8 w-8 text-slate-400" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Links */}
      {editing && (
        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">Linked Matter (optional)</Label>
            <Select value={matterId} onValueChange={(v) => { setMatterId(v); setEventId('none'); }}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="No matter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No matter</SelectItem>
                {matters.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.reference_no} — {m.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">Linked Event (optional)</Label>
            <Select value={eventId} onValueChange={setEventId}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="No event" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No event</SelectItem>
                {matterEvents.map((ev) => (
                  <SelectItem key={ev.id} value={ev.id}>{ev.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto mt-4 space-y-4">
        {editing ? (
          <Tabs defaultValue={note.svg_content ? 'handwritten' : 'typed'} className="space-y-3">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="typed">
                <Type className="h-3.5 w-3.5 mr-1.5" />Typed
              </TabsTrigger>
              <TabsTrigger value="handwritten">
                <PenLine className="h-3.5 w-3.5 mr-1.5" />Handwritten
              </TabsTrigger>
            </TabsList>
            <TabsContent value="typed">
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={12}
                placeholder="Write your note here…"
                className="resize-none"
              />
            </TabsContent>
            <TabsContent value="handwritten">
              <SvgSketchpad value={svgContent} onChange={setSvgContent} />
            </TabsContent>
          </Tabs>
        ) : (
          <>
            {note.body && (
              <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700 dark:text-slate-300">
                {note.body}
              </p>
            )}
            {note.svg_content && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
                <img
                  src={svgDataUrl(note.svg_content)}
                  alt="Handwritten note"
                  className="max-h-[480px] w-full object-contain"
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── New note form ─────────────────────────────────────────────────────────────

function NewNoteForm({
  matters,
  events,
  onCreated,
  onCancel,
}: {
  matters: BackendMatter[];
  events: BackendCalendarEvent[];
  onCreated: (note: BackendNote) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [svgContent, setSvgContent] = useState('');
  const [matterId, setMatterId] = useState('none');
  const [eventId, setEventId] = useState('none');
  const [saving, setSaving] = useState(false);

  const matterEvents = useMemo(
    () => matterId !== 'none' ? events.filter((e) => e.matter_id === matterId) : events,
    [events, matterId]
  );

  const canSave = title.trim() && (body.trim() || svgContent.trim());

  const handleCreate = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const note = await createNote({
        title: title.trim(),
        body: body.trim() || undefined,
        svg_content: svgContent.trim() || undefined,
        matter_id: matterId !== 'none' ? matterId : undefined,
        event_id: eventId !== 'none' ? eventId : undefined,
      });
      onCreated(note);
      toast.success('Note created.');
    } catch (err) {
      handleApiError(err, 'Unable to create note.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Title</Label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Note title…"
          autoFocus
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>
            Matter <span className="text-slate-400 font-normal">(optional)</span>
          </Label>
          <Select value={matterId} onValueChange={(v) => { setMatterId(v); setEventId('none'); }}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="No matter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No matter</SelectItem>
              {matters.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.reference_no} — {m.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>
            Event <span className="text-slate-400 font-normal">(optional)</span>
          </Label>
          <Select value={eventId} onValueChange={setEventId}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="No event" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No event</SelectItem>
              {matterEvents.map((ev) => (
                <SelectItem key={ev.id} value={ev.id}>{ev.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="typed" className="space-y-3">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="typed">
            <Type className="h-3.5 w-3.5 mr-1.5" />Typed
          </TabsTrigger>
          <TabsTrigger value="handwritten">
            <PenLine className="h-3.5 w-3.5 mr-1.5" />Handwritten
          </TabsTrigger>
        </TabsList>
        <TabsContent value="typed">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            placeholder="Write your note here…"
            className="resize-none"
          />
        </TabsContent>
        <TabsContent value="handwritten">
          <SvgSketchpad value={svgContent} onChange={setSvgContent} />
        </TabsContent>
      </Tabs>

      <div className="flex gap-2">
        <Button
          disabled={!canSave || saving}
          onClick={() => void handleCreate()}
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Plus className="h-4 w-4 mr-1.5" />}
          Save Note
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function NotesPage() {
  const [notes, setNotes] = useState<BackendNote[]>([]);
  const [matters, setMatters] = useState<BackendMatter[]>([]);
  const [events, setEvents] = useState<BackendCalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedNote, setSelectedNote] = useState<BackendNote | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<BackendNote | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [search, setSearch] = useState('');
  const [filterMatter, setFilterMatter] = useState('all');
  const [filterType, setFilterType] = useState<NoteType | 'all'>('all');

  // Load everything on mount
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    Promise.all([
      listNotes({ limit: 100 }),
      listMatters({ page_size: 100 }),
      listCalendarEvents({}),
    ])
      .then(([notesRes, mattersRes, eventsRes]) => {
        if (cancelled) return;
        setNotes(notesRes);
        setMatters(mattersRes.items.filter((m) => m.status !== 'archived'));
        setEvents(eventsRes.items);
      })
      .catch((err) => handleApiError(err, 'Unable to load notes.'))
      .finally(() => { if (!cancelled) setIsLoading(false); });

    return () => { cancelled = true; };
  }, []);

  const matterById = useMemo(() => new Map(matters.map((m) => [m.id, m])), [matters]);

  const filteredNotes = useMemo(() => {
    let result = notes;
    if (filterMatter !== 'all') {
      result = result.filter((n) => n.matter_id === filterMatter);
    }
    if (filterType !== 'all') {
      result = result.filter((n) => n.note_type === filterType);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((n) =>
        n.title.toLowerCase().includes(q) || (n.body ?? '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [notes, filterMatter, filterType, search]);

  const handleCreated = (note: BackendNote) => {
    setNotes((prev) => [note, ...prev]);
    setIsCreating(false);
    setSelectedNote(note);
  };

  const handleUpdated = (updated: BackendNote) => {
    setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
    setSelectedNote(updated);
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      await deleteNote(pendingDelete.id);
      setNotes((prev) => prev.filter((n) => n.id !== pendingDelete.id));
      if (selectedNote?.id === pendingDelete.id) setSelectedNote(null);
      setPendingDelete(null);
      toast.success('Note deleted.');
    } catch (err) {
      handleApiError(err, 'Unable to delete note.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">Notes</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Capture typed and handwritten notes. Optionally link to a matter or calendar event.
          </p>
        </div>
        {!isCreating && (
          <Button
            onClick={() => { setIsCreating(true); setSelectedNote(null); }}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            New Note
          </Button>
        )}
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="flex items-center gap-3 py-12">
            <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
            <span className="text-sm text-slate-500">Loading notes…</span>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
          {/* ── Left panel: list + filters — hidden on mobile when a note is open ── */}
          <div className={cn('space-y-3', (selectedNote || isCreating) && 'hidden xl:block')}>
            {/* Search + filters */}
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search notes…"
                  className="pl-9 h-9"
                />
              </div>
              <div className="flex gap-2">
                <Select value={filterMatter} onValueChange={setFilterMatter}>
                  <SelectTrigger className="h-8 flex-1 text-xs">
                    <SelectValue placeholder="All matters" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All matters</SelectItem>
                    <SelectItem value="none">No matter</SelectItem>
                    {matters.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.reference_no}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterType} onValueChange={(v) => setFilterType(v as NoteType | 'all')}>
                  <SelectTrigger className="h-8 flex-1 text-xs">
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    <SelectItem value="typed">Typed</SelectItem>
                    <SelectItem value="handwritten">Handwritten</SelectItem>
                    <SelectItem value="mixed">Mixed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Note count */}
            <div className="flex items-center justify-between px-0.5">
              <span className="text-xs text-slate-500">
                {filteredNotes.length} note{filteredNotes.length !== 1 ? 's' : ''}
              </span>
              {(search || filterMatter !== 'all' || filterType !== 'all') && (
                <button
                  className="text-xs text-emerald-600 hover:underline"
                  onClick={() => { setSearch(''); setFilterMatter('all'); setFilterType('all'); }}
                >
                  Clear filters
                </button>
              )}
            </div>

            {/* Note list */}
            {filteredNotes.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 py-12 text-center">
                <NotebookPen className="h-8 w-8 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                <p className="text-sm text-slate-500">
                  {notes.length === 0 ? 'No notes yet. Create your first note.' : 'No notes match your filters.'}
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[calc(100vh-260px)] overflow-y-auto pr-1">
                {filteredNotes.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    matterTitle={note.matter_id ? matterById.get(note.matter_id)?.reference_no : undefined}
                    onDelete={() => setPendingDelete(note)}
                    onSelect={() => { setSelectedNote(note); setIsCreating(false); }}
                    isSelected={selectedNote?.id === note.id}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ── Right panel: viewer / new form ── */}
          <Card className="shadow-sm min-h-[500px]">
            <CardContent className="p-6 h-full">
              {isCreating ? (
                <>
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-900 dark:text-slate-100 mb-4">
                    New Note
                  </h2>
                  <NewNoteForm
                    matters={matters}
                    events={events}
                    onCreated={handleCreated}
                    onCancel={() => setIsCreating(false)}
                  />
                </>
              ) : selectedNote ? (
                <NoteViewer
                  key={selectedNote.id}
                  note={selectedNote}
                  matters={matters}
                  events={events}
                  onUpdated={handleUpdated}
                  onClose={() => setSelectedNote(null)}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full py-20 text-center">
                  <div className="rounded-2xl bg-slate-50 dark:bg-slate-900 p-5 mb-4">
                    <NotebookPen className="h-10 w-10 text-slate-300 dark:text-slate-600" />
                  </div>
                  <p className="text-sm text-slate-500">
                    Select a note to view it, or create a new one.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-4"
                    onClick={() => setIsCreating(true)}
                  >
                    <Plus className="h-4 w-4 mr-1.5" />
                    New Note
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Delete confirm */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => { if (!open) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Note</AlertDialogTitle>
            <AlertDialogDescription>
              Delete &ldquo;{pendingDelete?.title}&rdquo;? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              onClick={() => void handleDelete()}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default NotesPage;
