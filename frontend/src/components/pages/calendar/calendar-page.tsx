'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ExternalLink, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import { handleApiError, extractErrorMessage } from '@/lib/error-utils';
import { listMatters, type BackendMatter } from '@/lib/api/matters';
import {
  createMatterEvent,
  deleteMatterEvent,
  listCalendarEvents,
  syncMatterEventToGoogle,
  type BackendCalendarEvent,
  type BackendCalendarEventType,
} from '@/lib/api/calendar';

import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';

const EVENT_LABELS: Record<BackendCalendarEventType, string> = {
  court_date: 'Court date',
  deadline: 'Deadline',
  meeting: 'Meeting',
  reminder: 'Reminder',
  other: 'Other',
};

function eventStyle(type: BackendCalendarEventType) {
  switch (type) {
    case 'court_date':  return 'border-red-200 bg-red-50 text-red-700';
    case 'deadline':    return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'meeting':     return 'border-blue-200 bg-blue-50 text-blue-700';
    case 'reminder':    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    default:            return 'border-slate-200 bg-slate-50 text-slate-600';
  }
}

function dayKey(value: string) {
  return new Date(value).toDateString();
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('en-NG', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

export function CalendarPage() {
  const [matters, setMatters] = useState<BackendMatter[]>([]);
  const [events, setEvents] = useState<BackendCalendarEvent[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [selectedMatterId, setSelectedMatterId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [savingEvent, setSavingEvent] = useState(false);

  const [eventForm, setEventForm] = useState({
    title: '',
    event_type: 'court_date' as BackendCalendarEventType,
    starts_at: '',
    ends_at: '',
    location: '',
    description: '',
  });

  const matterById = useMemo(() => new Map(matters.map((m) => [m.id, m])), [matters]);

  const eventsOnSelectedDay = useMemo(() => {
    if (!selectedDate) return events;
    return events.filter((event) => dayKey(event.starts_at) === selectedDate.toDateString());
  }, [events, selectedDate]);

  const loadData = async (silent = false) => {
    if (silent) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);
    try {
      const [matterResponse, eventResponse] = await Promise.all([
        listMatters({ page_size: 100 }),
        listCalendarEvents({}),
      ]);
      const activeMatters = matterResponse.items.filter((m) => m.status !== 'archived');
      setMatters(activeMatters);
      setEvents(eventResponse.items);
      setSelectedMatterId((cur) => cur || activeMatters[0]?.id || '');
    } catch (err) {
      setError(extractErrorMessage(err, 'Unable to load calendar data.'));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => { void loadData(); }, []);

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
      setEvents((cur) => [...cur, created].sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at)));
      setEventForm({ title: '', event_type: 'court_date', starts_at: '', ends_at: '', location: '', description: '' });
      toast.success('Calendar event created.');
    } catch (err) {
      handleApiError(err, 'Unable to create calendar event.');
    } finally {
      setSavingEvent(false);
    }
  };

  const handleSyncEvent = async (event: BackendCalendarEvent) => {
    setSyncingId(event.id);
    try {
      const updated = await syncMatterEventToGoogle(event.matter_id, event.id);
      setEvents((cur) => cur.map((item) => (item.id === updated.id ? updated : item)));
      toast.success('Pushed to Google Calendar.');
    } catch (err) {
      handleApiError(err, 'Unable to sync to Google Calendar.');
    } finally {
      setSyncingId(null);
    }
  };

  const handleDeleteEvent = async (event: BackendCalendarEvent) => {
    setDeletingId(event.id);
    try {
      await deleteMatterEvent(event.matter_id, event.id);
      setEvents((cur) => cur.filter((item) => item.id !== event.id));
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
          <span className="text-sm text-slate-500 dark:text-slate-400">Loading calendar…</span>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="space-y-4 py-8">
          <p className="text-sm text-slate-600 dark:text-slate-400">{error}</p>
          <Button variant="outline" onClick={() => void loadData()}>Try Again</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">Calendar</h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Track court dates, deadlines, and meetings with optional Google Calendar sync.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void loadData(true)} disabled={isRefreshing}>
          <RefreshCw className={cn('mr-2 h-4 w-4', isRefreshing && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        {/* ── Mini calendar + day events ── */}
        <Card className="shadow-sm">
          <CardContent className="space-y-4 p-4">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-emerald-600" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-900 dark:text-slate-100">Calendar</h2>
            </div>
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              className="rounded-xl border"
            />
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {selectedDate
                    ? selectedDate.toLocaleDateString('en-NG', { month: 'long', day: 'numeric', year: 'numeric' })
                    : 'All events'}
                </h3>
                <Badge variant="outline">{eventsOnSelectedDay.length}</Badge>
              </div>
              {eventsOnSelectedDay.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">No events on this date.</p>
              ) : (
                <div className="space-y-2">
                  {eventsOnSelectedDay.map((event) => (
                    <div key={event.id} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{event.title}</p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {matterById.get(event.matter_id)?.reference_no} · {matterById.get(event.matter_id)?.title}
                          </p>
                        </div>
                        <Badge className={cn('border text-[10px]', eventStyle(event.event_type))}>
                          {EVENT_LABELS[event.event_type]}
                        </Badge>
                      </div>
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{formatDateTime(event.starts_at)}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          size="sm" variant="outline" className="h-8 text-xs"
                          onClick={() => void handleSyncEvent(event)}
                          disabled={syncingId === event.id}
                        >
                          {syncingId === event.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                          Push to Google
                        </Button>
                        {event.google_event_url && (
                          <Button
                            size="sm" variant="outline" className="h-8 text-xs"
                            onClick={() => window.open(event.google_event_url || '', '_blank', 'noopener,noreferrer')}
                          >
                            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                            Open Google
                          </Button>
                        )}
                        <Button
                          size="sm" variant="outline" className="h-8 text-xs text-red-600 hover:bg-red-50"
                          onClick={() => void handleDeleteEvent(event)}
                          disabled={deletingId === event.id}
                        >
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

        {/* ── New event form ── */}
        <Card className="shadow-sm">
          <CardContent className="space-y-4 p-6">
            <div className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-emerald-600" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-900 dark:text-slate-100">New Calendar Event</h2>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Matter</Label>
                <Select value={selectedMatterId} onValueChange={setSelectedMatterId}>
                  <SelectTrigger><SelectValue placeholder="Select matter" /></SelectTrigger>
                  <SelectContent>
                    {matters.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.reference_no} - {m.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={eventForm.event_type}
                  onValueChange={(v) => setEventForm((cur) => ({ ...cur, event_type: v as BackendCalendarEventType }))}
                >
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
                <Input
                  value={eventForm.title}
                  onChange={(e) => setEventForm((cur) => ({ ...cur, title: e.target.value }))}
                  placeholder="Hearing, filing, mention, review…"
                />
              </div>
              <div className="space-y-2">
                <Label>Starts</Label>
                <Input
                  type="datetime-local"
                  value={eventForm.starts_at}
                  onChange={(e) => setEventForm((cur) => ({ ...cur, starts_at: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Ends</Label>
                <Input
                  type="datetime-local"
                  value={eventForm.ends_at}
                  onChange={(e) => setEventForm((cur) => ({ ...cur, ends_at: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Location</Label>
                <Input
                  value={eventForm.location}
                  onChange={(e) => setEventForm((cur) => ({ ...cur, location: e.target.value }))}
                  placeholder="Courtroom, registry, chambers…"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Description</Label>
                <Textarea
                  value={eventForm.description}
                  onChange={(e) => setEventForm((cur) => ({ ...cur, description: e.target.value }))}
                  placeholder="Optional event details"
                  rows={3}
                />
              </div>
            </div>
            <Button
              onClick={() => void handleCreateEvent()}
              disabled={savingEvent || !selectedMatterId || !eventForm.title.trim() || !eventForm.starts_at}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {savingEvent ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Event
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default CalendarPage;
