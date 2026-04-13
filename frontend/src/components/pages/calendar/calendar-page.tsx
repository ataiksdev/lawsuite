'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ExternalLink, Loader2, NotebookPen, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import { handleApiError, extractErrorMessage } from '@/lib/error-utils';
import { listMatters, type BackendMatter } from '@/lib/api/matters';
import {
  createMatterEvent,
  createMatterNote,
  deleteMatterEvent,
  listCalendarEvents,
  listRecentMatterNotes,
  syncMatterEventToGoogle,
  type BackendCalendarEvent,
  type BackendCalendarEventType,
  type BackendMatterNote,
} from '@/lib/api/calendar';

import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { SvgSketchpad } from '@/components/shared/svg-sketchpad';

const EVENT_LABELS: Record<BackendCalendarEventType, string> = {
  court_date: 'Court date',
  deadline: 'Deadline',
  meeting: 'Meeting',
  reminder: 'Reminder',
  other: 'Other',
};

function eventStyle(type: BackendCalendarEventType) {
  switch (type) {
    case 'court_date':
      return 'border-red-200 bg-red-50 text-red-700';
    case 'deadline':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'meeting':
      return 'border-blue-200 bg-blue-50 text-blue-700';
    case 'reminder':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    default:
      return 'border-slate-200 bg-slate-50 text-slate-600';
  }
}

function dayKey(value: string) {
  return new Date(value).toDateString();
}

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

export function CalendarPage() {
  const [matters, setMatters] = useState<BackendMatter[]>([]);
  const [events, setEvents] = useState<BackendCalendarEvent[]>([]);
  const [notes, setNotes] = useState<BackendMatterNote[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [selectedMatterId, setSelectedMatterId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [savingEvent, setSavingEvent] = useState(false);
  const [savingNote, setSavingNote] = useState(false);

  const [eventForm, setEventForm] = useState({
    title: '',
    event_type: 'court_date' as BackendCalendarEventType,
    starts_at: '',
    ends_at: '',
    location: '',
    description: '',
  });
  const [noteForm, setNoteForm] = useState({
    title: '',
    body: '',
    svg_content: '',
    event_id: 'none',
  });

  const matterById = useMemo(() => new Map(matters.map((matter) => [matter.id, matter])), [matters]);

  const eventsOnSelectedDay = useMemo(() => {
    if (!selectedDate) return events;
    return events.filter((event) => dayKey(event.starts_at) === selectedDate.toDateString());
  }, [events, selectedDate]);

  const loadData = async (silent = false) => {
    if (silent) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);
    try {
      const [matterResponse, eventResponse, recentNotes] = await Promise.all([
        listMatters({ page_size: 100 }),
        listCalendarEvents({}),
        listRecentMatterNotes(12),
      ]);
      const activeMatters = matterResponse.items.filter((matter) => matter.status !== 'archived');
      setMatters(activeMatters);
      setEvents(eventResponse.items);
      setNotes(recentNotes);
      setSelectedMatterId((current) => current || activeMatters[0]?.id || '');
    } catch (err) {
      setError(extractErrorMessage(err, 'Unable to load calendar data.'));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleCreateEvent = async () => {
    if (!selectedMatterId || !eventForm.title.trim() || !eventForm.starts_at) return;
    setSavingEvent(true);
    try {
      const created = await createMatterEvent(selectedMatterId, {
        title: eventForm.title.trim(),
        event_type: eventForm.event_type,
        starts_at: new Date(eventForm.starts_at).toISOString(),
        ends_at: eventForm.ends_at ? new Date(eventForm.ends_at).toISOString() : undefined,
        description: eventForm.description.trim() || undefined,
        location: eventForm.location.trim() || undefined,
      });
      setEvents((current) => [...current, created].sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at)));
      setEventForm({ title: '', event_type: 'court_date', starts_at: '', ends_at: '', location: '', description: '' });
      toast.success('Calendar event created.');
    } catch (err) {
      handleApiError(err, 'Unable to create calendar event.');
    } finally {
      setSavingEvent(false);
    }
  };

  const handleCreateNote = async () => {
    if (!selectedMatterId || !noteForm.title.trim() || (!noteForm.body.trim() && !noteForm.svg_content.trim())) return;
    setSavingNote(true);
    try {
      const created = await createMatterNote(selectedMatterId, {
        title: noteForm.title.trim(),
        body: noteForm.body.trim() || undefined,
        svg_content: noteForm.svg_content.trim() || undefined,
        event_id: noteForm.event_id !== 'none' ? noteForm.event_id : undefined,
      });
      setNotes((current) => [created, ...current].slice(0, 20));
      setNoteForm({ title: '', body: '', svg_content: '', event_id: 'none' });
      toast.success('Matter note saved.');
    } catch (err) {
      handleApiError(err, 'Unable to save note.');
    } finally {
      setSavingNote(false);
    }
  };

  const handleSyncEvent = async (event: BackendCalendarEvent) => {
    setSyncingId(event.id);
    try {
      const updated = await syncMatterEventToGoogle(event.matter_id, event.id);
      setEvents((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      toast.success('Pushed to Google Calendar.');
    } catch (err) {
      handleApiError(err, 'Unable to sync this event to Google Calendar.');
    } finally {
      setSyncingId(null);
    }
  };

  const handleDeleteEvent = async (event: BackendCalendarEvent) => {
    setDeletingId(event.id);
    try {
      await deleteMatterEvent(event.matter_id, event.id);
      setEvents((current) => current.filter((item) => item.id !== event.id));
      toast.success('Calendar event deleted.');
    } catch (err) {
      handleApiError(err, 'Unable to delete event.');
    } finally {
      setDeletingId(null);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 py-10">
          <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
          <span className="text-sm text-slate-500">Loading calendar…</span>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="space-y-4 py-8">
          <p className="text-sm text-slate-600">{error}</p>
          <Button variant="outline" onClick={() => void loadData()}>
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const selectedMatterEvents = selectedMatterId
    ? events.filter((event) => event.matter_id === selectedMatterId)
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">Calendar & Notes</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Track court dates, deadlines, and matter notes with optional push-only Google Calendar sync.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void loadData(true)} disabled={isRefreshing}>
          <RefreshCw className={cn('mr-2 h-4 w-4', isRefreshing && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <Card className="shadow-sm">
          <CardContent className="space-y-4 p-4">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-emerald-600" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-900">Calendar</h2>
            </div>
            <Calendar mode="single" selected={selectedDate} onSelect={setSelectedDate} className="rounded-xl border" />
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-slate-900">
                  {selectedDate ? selectedDate.toLocaleDateString('en-NG', { month: 'long', day: 'numeric', year: 'numeric' }) : 'All events'}
                </h3>
                <Badge variant="outline">{eventsOnSelectedDay.length}</Badge>
              </div>
              {eventsOnSelectedDay.length === 0 ? (
                <p className="text-sm text-slate-500">No events on this date.</p>
              ) : (
                <div className="space-y-2">
                  {eventsOnSelectedDay.map((event) => (
                    <div key={event.id} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{event.title}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {matterById.get(event.matter_id)?.reference_no} · {matterById.get(event.matter_id)?.title}
                          </p>
                        </div>
                        <Badge className={cn('border text-[10px]', eventStyle(event.event_type))}>
                          {EVENT_LABELS[event.event_type]}
                        </Badge>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">{formatDateTime(event.starts_at)}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => void handleSyncEvent(event)} disabled={syncingId === event.id}>
                          {syncingId === event.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                          Push to Google
                        </Button>
                        {event.google_event_url && (
                          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => window.open(event.google_event_url || '', '_blank', 'noopener,noreferrer')}>
                            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                            Open Google
                          </Button>
                        )}
                        <Button size="sm" variant="outline" className="h-8 text-xs text-red-600 hover:bg-red-50" onClick={() => void handleDeleteEvent(event)} disabled={deletingId === event.id}>
                          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                          Delete
                        </Button>
                      </div>
                      {event.google_last_error && (
                        <p className="mt-2 text-xs text-red-500">{event.google_last_error}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-6">
          <Card className="shadow-sm">
            <CardContent className="space-y-4 p-6">
              <div className="flex items-center gap-2">
                <Plus className="h-4 w-4 text-emerald-600" />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-900">New Calendar Event</h2>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Matter</Label>
                  <Select value={selectedMatterId} onValueChange={setSelectedMatterId}>
                    <SelectTrigger><SelectValue placeholder="Select matter" /></SelectTrigger>
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
                  <Label>Type</Label>
                  <Select value={eventForm.event_type} onValueChange={(value) => setEventForm((current) => ({ ...current, event_type: value as BackendCalendarEventType }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(EVENT_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Title</Label>
                  <Input value={eventForm.title} onChange={(event) => setEventForm((current) => ({ ...current, title: event.target.value }))} placeholder="Hearing, filing, mention, review..." />
                </div>
                <div className="space-y-2">
                  <Label>Starts</Label>
                  <Input type="datetime-local" value={eventForm.starts_at} onChange={(event) => setEventForm((current) => ({ ...current, starts_at: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Ends</Label>
                  <Input type="datetime-local" value={eventForm.ends_at} onChange={(event) => setEventForm((current) => ({ ...current, ends_at: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Location</Label>
                  <Input value={eventForm.location} onChange={(event) => setEventForm((current) => ({ ...current, location: event.target.value }))} placeholder="Courtroom, registry, chambers..." />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Description</Label>
                  <Textarea value={eventForm.description} onChange={(event) => setEventForm((current) => ({ ...current, description: event.target.value }))} placeholder="Optional event details" rows={3} />
                </div>
              </div>
              <Button onClick={() => void handleCreateEvent()} disabled={savingEvent || !selectedMatterId || !eventForm.title.trim() || !eventForm.starts_at} className="bg-emerald-600 text-white hover:bg-emerald-700">
                {savingEvent ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save Event
              </Button>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="space-y-4 p-6">
              <div className="flex items-center gap-2">
                <NotebookPen className="h-4 w-4 text-emerald-600" />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-900">New Matter Note</h2>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Matter</Label>
                  <Select value={selectedMatterId} onValueChange={setSelectedMatterId}>
                    <SelectTrigger><SelectValue placeholder="Select matter" /></SelectTrigger>
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
                  <Label>Linked Event</Label>
                  <Select value={noteForm.event_id} onValueChange={(value) => setNoteForm((current) => ({ ...current, event_id: value }))}>
                    <SelectTrigger><SelectValue placeholder="Standalone note" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Standalone note</SelectItem>
                      {selectedMatterEvents.map((event) => (
                        <SelectItem key={event.id} value={event.id}>
                          {event.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Title</Label>
                  <Input value={noteForm.title} onChange={(event) => setNoteForm((current) => ({ ...current, title: event.target.value }))} placeholder="Bench note, strategy note, call note..." />
                </div>
              </div>

              <Tabs defaultValue="typed" className="space-y-4">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="typed">Typed Note</TabsTrigger>
                  <TabsTrigger value="handwritten">Handwritten Note</TabsTrigger>
                </TabsList>
                <TabsContent value="typed" className="space-y-2">
                  <Label>Typed content</Label>
                  <Textarea value={noteForm.body} onChange={(event) => setNoteForm((current) => ({ ...current, body: event.target.value }))} rows={5} placeholder="Type your matter note here" />
                </TabsContent>
                <TabsContent value="handwritten" className="space-y-2">
                  <SvgSketchpad value={noteForm.svg_content} onChange={(value) => setNoteForm((current) => ({ ...current, svg_content: value }))} />
                </TabsContent>
              </Tabs>

              <Button onClick={() => void handleCreateNote()} disabled={savingNote || !selectedMatterId || !noteForm.title.trim() || (!noteForm.body.trim() && !noteForm.svg_content.trim())} className="bg-emerald-600 text-white hover:bg-emerald-700">
                {savingNote ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save Note
              </Button>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="space-y-4 p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-900">Recent Notes</h2>
              {notes.length === 0 ? (
                <p className="text-sm text-slate-500">No notes yet.</p>
              ) : (
                <div className="space-y-3">
                  {notes.map((note) => (
                    <div key={note.id} className="rounded-xl border border-slate-200 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{note.title}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {matterById.get(note.matter_id)?.reference_no} · {note.author_name}
                          </p>
                        </div>
                        <Badge variant="outline">{note.note_type}</Badge>
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
        </div>
      </div>
    </div>
  );
}

export default CalendarPage;
