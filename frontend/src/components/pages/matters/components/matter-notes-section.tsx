'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, NotebookPen, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import { handleApiError } from '@/lib/error-utils';
import { listCalendarEvents, type BackendCalendarEvent } from '@/lib/api/calendar';
import {
  listNotes,
  createNote,
  deleteNote,
  type BackendNote,
} from '@/lib/api/notes';

import { SvgSketchpad } from '@/components/shared/svg-sketchpad';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('en-NG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function svgDataUrl(svg: string) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function MatterNotesSection({ matterId }: { matterId: string }) {
  const [notes, setNotes] = useState<BackendNote[]>([]);
  const [events, setEvents] = useState<BackendCalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: '', body: '', svg_content: '', event_id: 'none' });

  const eventTitleById = useMemo(() => new Map(events.map((event) => [event.id, event.title])), [events]);

  const loadNotes = async (silent = false) => {
    if (silent) setIsRefreshing(true);
    else setIsLoading(true);
    try {
      const [noteList, eventList] = await Promise.all([
        listNotes({ matter_id: matterId }),
        listCalendarEvents({ matter_id: matterId }),
      ]);
      setNotes(noteList);
      setEvents(eventList.items);
    } catch (error) {
      handleApiError(error, 'Unable to load matter notes.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    void loadNotes();
  }, [matterId]);

  const handleCreate = async () => {
    if (!form.title.trim() || (!form.body.trim() && !form.svg_content.trim())) return;
    setSaving(true);
    try {
      const created = await createNote({
        title: form.title.trim(),
        body: form.body.trim() || undefined,
        svg_content: form.svg_content.trim() || undefined,
        matter_id: matterId,
        event_id: form.event_id !== 'none' ? form.event_id : undefined,
      });
      setNotes((current) => [created, ...current]);
      setForm({ title: '', body: '', svg_content: '', event_id: 'none' });
      toast.success('Matter note saved.');
    } catch (error) {
      handleApiError(error, 'Unable to save matter note.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (note: BackendNote) => {
    setDeletingId(note.id);
    try {
      await deleteNote(note.id);
      setNotes((current) => current.filter((item) => item.id !== note.id));
      toast.success('Matter note deleted.');
    } catch (error) {
      handleApiError(error, 'Unable to delete note.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Card className="shadow-sm lg:col-span-2">
      <CardContent className="space-y-4 p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <NotebookPen className="h-4 w-4 text-slate-500" />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-900 dark:text-slate-100">
              Matter Notes
            </h3>
            <Badge variant="outline">{notes.length}</Badge>
          </div>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => void loadNotes(true)} disabled={isRefreshing}>
            <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
            Refresh
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label>Note title</Label>
            <Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Bench note, strategy note, client call note..." />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Linked event</Label>
            <Select value={form.event_id} onValueChange={(value) => setForm((current) => ({ ...current, event_id: value }))}>
              <SelectTrigger><SelectValue placeholder="Standalone note" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Standalone note</SelectItem>
                {events.map((event) => (
                  <SelectItem key={event.id} value={event.id}>{event.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Tabs defaultValue="typed" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="typed">Typed</TabsTrigger>
            <TabsTrigger value="handwritten">Handwritten</TabsTrigger>
          </TabsList>
          <TabsContent value="typed" className="space-y-2">
            <Label>Typed content</Label>
            <Textarea value={form.body} onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))} rows={5} placeholder="Type the matter note here" />
          </TabsContent>
          <TabsContent value="handwritten" className="space-y-2">
            <SvgSketchpad value={form.svg_content} onChange={(value) => setForm((current) => ({ ...current, svg_content: value }))} />
          </TabsContent>
        </Tabs>

        <Button onClick={() => void handleCreate()} disabled={saving || !form.title.trim() || (!form.body.trim() && !form.svg_content.trim())} className="bg-emerald-600 text-white hover:bg-emerald-700">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save Note
        </Button>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-400 py-4">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading notes…
          </div>
        ) : notes.length === 0 ? (
          <p className="text-sm text-slate-500">No notes captured for this matter yet.</p>
        ) : (
          <div className="space-y-3">
            {notes.map((note) => (
              <div key={note.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">{note.title}</p>
                      <Badge variant="outline">{note.note_type}</Badge>
                      {note.event_id && <Badge variant="outline">Event: {eventTitleById.get(note.event_id) ?? 'Linked'}</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {note.author_name} · Updated {formatDateTime(note.updated_at)}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" className="h-8 text-xs text-red-600 hover:bg-red-50" onClick={() => void handleDelete(note)} disabled={deletingId === note.id}>
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    Delete
                  </Button>
                </div>
                {note.body && <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">{note.body}</p>}
                {note.svg_content && (
                  <div className="mt-3 rounded-lg border bg-white p-2">
                    <img alt="Handwritten matter note" className="max-h-48 w-full object-contain" src={svgDataUrl(note.svg_content)} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default MatterNotesSection;
