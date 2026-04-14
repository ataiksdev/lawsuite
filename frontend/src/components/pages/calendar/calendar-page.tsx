'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  CalendarOff,
  Clock,
  ExternalLink,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
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

import { Calendar, CalendarDayButton } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

// ============================================================================
// Constants & helpers
// ============================================================================

const EVENT_LABELS: Record<BackendCalendarEventType, string> = {
  court_date: 'Court date',
  deadline:   'Deadline',
  meeting:    'Meeting',
  reminder:   'Reminder',
  other:      'Other',
};

function eventBadgeStyle(type: BackendCalendarEventType) {
  switch (type) {
    case 'court_date': return 'border-red-200    bg-red-50    text-red-700    dark:bg-red-950/30    dark:text-red-300    dark:border-red-800';
    case 'deadline':   return 'border-amber-200  bg-amber-50  text-amber-700  dark:bg-amber-950/30  dark:text-amber-300  dark:border-amber-800';
    case 'meeting':    return 'border-blue-200   bg-blue-50   text-blue-700   dark:bg-blue-950/30   dark:text-blue-300   dark:border-blue-800';
    case 'reminder':   return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800';
    default:           return 'border-slate-200  bg-slate-50  text-slate-600  dark:bg-slate-800/30  dark:text-slate-400  dark:border-slate-700';
  }
}

const EVENT_BAR_COLOR: Record<BackendCalendarEventType, string> = {
  court_date: 'bg-red-400',
  deadline:   'bg-amber-400',
  meeting:    'bg-blue-400',
  reminder:   'bg-emerald-500',
  other:      'bg-slate-300 dark:bg-slate-600',
};

function dayKey(iso: string) {
  return new Date(iso).toDateString();
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-NG', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function formatDateHeading(date: Date) {
  return date.toLocaleDateString('en-NG', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

function groupEventsByDay(list: BackendCalendarEvent[]): [string, BackendCalendarEvent[]][] {
  const map = new Map<string, BackendCalendarEvent[]>();
  for (const e of list) {
    const k = dayKey(e.starts_at);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(e);
  }
  return Array.from(map.entries());
}

// ============================================================================
// New Event Dialog Form
// ============================================================================

interface NewEventFormProps {
  matters: BackendMatter[];
  onCreated: (event: BackendCalendarEvent) => void;
  onClose: () => void;
}

function NewEventForm({ matters, onCreated, onClose }: NewEventFormProps) {
  const [matterId, setMatterId] = useState(matters[0]?.id ?? '');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '',
    event_type: 'court_date' as BackendCalendarEventType,
    starts_at: '',
    ends_at: '',
    location: '',
    description: '',
  });

  const patch = (field: Partial<typeof form>) => setForm((c) => ({ ...c, ...field }));
  const canSave = matterId && form.title.trim() && form.starts_at;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const created = await createMatterEvent(matterId, {
        title:       form.title.trim(),
        event_type:  form.event_type,
        starts_at:   new Date(form.starts_at).toISOString(),
        ends_at:     form.ends_at ? new Date(form.ends_at).toISOString() : undefined,
        description: form.description.trim() || undefined,
        location:    form.location.trim() || undefined,
      });
      toast.success('Calendar event created.');
      onCreated(created);
      onClose();
    } catch (err) {
      handleApiError(err, 'Unable to create calendar event.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Matter</Label>
          <Select value={matterId} onValueChange={setMatterId}>
            <SelectTrigger><SelectValue placeholder="Select matter" /></SelectTrigger>
            <SelectContent>
              {matters.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.reference_no} – {m.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Type</Label>
          <Select
            value={form.event_type}
            onValueChange={(v) => patch({ event_type: v as BackendCalendarEventType })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(EVENT_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label>Title</Label>
          <Input
            value={form.title}
            onChange={(e) => patch({ title: e.target.value })}
            placeholder="Hearing, filing, mention, review…"
          />
        </div>

        <div className="space-y-2">
          <Label>Starts</Label>
          <Input type="datetime-local" value={form.starts_at} onChange={(e) => patch({ starts_at: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>Ends</Label>
          <Input type="datetime-local" value={form.ends_at} onChange={(e) => patch({ ends_at: e.target.value })} />
        </div>

        <div className="space-y-2">
          <Label>Location</Label>
          <Input
            value={form.location}
            onChange={(e) => patch({ location: e.target.value })}
            placeholder="Courtroom, registry, chambers…"
          />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label>Description</Label>
          <Textarea
            value={form.description}
            onChange={(e) => patch({ description: e.target.value })}
            placeholder="Optional event details"
            rows={3}
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button
          onClick={() => void handleSave()}
          disabled={saving || !canSave}
          className="bg-emerald-600 text-white hover:bg-emerald-700"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save Event
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Event Card — shared between day panel and upcoming list
// ============================================================================

interface EventCardProps {
  event: BackendCalendarEvent;
  matterById: Map<string, BackendMatter>;
  syncingId: string | null;
  deletingId: string | null;
  onSync: (e: BackendCalendarEvent) => void;
  onDelete: (e: BackendCalendarEvent) => void;
  onClick?: () => void;
  compact?: boolean;
}

function EventCard({ event, matterById, syncingId, deletingId, onSync, onDelete, onClick, compact }: EventCardProps) {
  const matter = matterById.get(event.matter_id);
  return (
    <div
      className={cn(
        'group flex items-start gap-3 rounded-xl border border-slate-200 dark:border-slate-700 p-3',
        'hover:border-primary/40 dark:hover:border-primary/40 transition-colors',
        onClick && 'cursor-pointer',
      )}
      onClick={onClick}
    >
      {/* Colour bar */}
      <div className={cn('mt-0.5 w-1 self-stretch rounded-full shrink-0', EVENT_BAR_COLOR[event.event_type])} />

      <div className="flex-1 min-w-0 space-y-1.5">
        {/* Title + badge */}
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-tight">{event.title}</p>
          <Badge className={cn('border text-[10px] shrink-0', eventBadgeStyle(event.event_type))}>
            {EVENT_LABELS[event.event_type]}
          </Badge>
        </div>

        {/* Matter */}
        {matter && (
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate">
            {matter.reference_no} · {matter.title}
          </p>
        )}

        {/* Time + location */}
        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
          <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
            <Clock className="h-3 w-3 shrink-0" />
            {formatDateTime(event.starts_at)}
          </span>
          {event.location && (
            <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
              <MapPin className="h-3 w-3 shrink-0" />
              {event.location}
            </span>
          )}
        </div>

        {/* Description */}
        {event.description && (
          <p className={cn('text-xs text-slate-500 dark:text-slate-400 italic', compact && 'line-clamp-2')}>
            {event.description}
          </p>
        )}

        {/* Actions — stop propagation so click-to-select-day still works */}
        <div className="flex flex-wrap gap-1.5 pt-0.5" onClick={(e) => e.stopPropagation()}>
          <Button
            size="sm" variant="outline" className="h-7 text-xs px-2"
            onClick={() => onSync(event)}
            disabled={syncingId === event.id}
          >
            {syncingId === event.id && <Loader2 className="h-3 w-3 animate-spin" />}
            Push to Google
          </Button>
          {event.google_event_url && (
            <Button
              size="sm" variant="outline" className="h-7 text-xs px-2"
              onClick={() => window.open(event.google_event_url ?? '', '_blank', 'noopener,noreferrer')}
            >
              <ExternalLink className="h-3 w-3" /> Open
            </Button>
          )}
          <Button
            size="sm" variant="outline"
            className="h-7 text-xs px-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 dark:border-red-900/40"
            onClick={() => onDelete(event)}
            disabled={deletingId === event.id}
          >
            {deletingId === event.id
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <Trash2 className="h-3 w-3" />}
            Delete
          </Button>
        </div>

        {event.google_last_error && (
          <p className="text-xs text-red-500">{event.google_last_error}</p>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export function CalendarPage() {
  const [matters,      setMatters]      = useState<BackendMatter[]>([]);
  const [events,       setEvents]       = useState<BackendCalendarEvent[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [isLoading,    setIsLoading]    = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [syncingId,    setSyncingId]    = useState<string | null>(null);
  const [deletingId,   setDeletingId]   = useState<string | null>(null);
  const [dialogOpen,   setDialogOpen]   = useState(false);

  const matterById = useMemo(() => new Map(matters.map((m) => [m.id, m])), [matters]);

  // Days that have at least one event — used for calendar highlighting
  const eventDayKeys = useMemo(
    () => new Set(events.map((e) => dayKey(e.starts_at))),
    [events],
  );
  const hasEventsMatcher = useMemo(
    () => (date: Date) => eventDayKeys.has(date.toDateString()),
    [eventDayKeys],
  );

  // Events on the selected day
  const eventsOnDay = useMemo(() => {
    if (!selectedDate) return [];
    return events.filter((e) => dayKey(e.starts_at) === selectedDate.toDateString());
  }, [events, selectedDate]);

  // Upcoming events (today onwards), grouped by day
  const upcomingGrouped = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcoming = events
      .filter((e) => new Date(e.starts_at) >= today)
      .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));
    return groupEventsByDay(upcoming);
  }, [events]);

  const upcomingTotal = useMemo(
    () => upcomingGrouped.reduce((n, [, list]) => n + list.length, 0),
    [upcomingGrouped],
  );

  const loadData = async (silent = false) => {
    if (silent) setIsRefreshing(true);
    else        setIsLoading(true);
    setError(null);
    try {
      const [mr, er] = await Promise.all([
        listMatters({ page_size: 100 }),
        listCalendarEvents({}),
      ]);
      const active = mr.items.filter((m) => m.status !== 'archived');
      setMatters(active);
      setEvents(er.items);
    } catch (err) {
      setError(extractErrorMessage(err, 'Unable to load calendar data.'));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => { void loadData(); }, []);

  const handleCreated = (event: BackendCalendarEvent) =>
    setEvents((cur) => [...cur, event].sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at)));

  const handleSync = async (event: BackendCalendarEvent) => {
    setSyncingId(event.id);
    try {
      const updated = await syncMatterEventToGoogle(event.matter_id, event.id);
      setEvents((cur) => cur.map((e) => (e.id === updated.id ? updated : e)));
      toast.success('Pushed to Google Calendar.');
    } catch (err) {
      handleApiError(err, 'Unable to sync to Google Calendar.');
    } finally {
      setSyncingId(null);
    }
  };

  const handleDelete = async (event: BackendCalendarEvent) => {
    setDeletingId(event.id);
    try {
      await deleteMatterEvent(event.matter_id, event.id);
      setEvents((cur) => cur.filter((e) => e.id !== event.id));
      toast.success('Calendar event deleted.');
    } catch (err) {
      handleApiError(err, 'Unable to delete event.');
    } finally {
      setDeletingId(null);
    }
  };

  // ── Loading / error states ──────────────────────────────────────────────

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

  // ── Main render ─────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">Calendar</h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Track court dates, deadlines, and meetings with optional Google Calendar sync.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => void loadData(true)} disabled={isRefreshing}>
            <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
            Refresh
          </Button>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700">
                <Plus className="h-4 w-4" />
                New Event
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>New Calendar Event</DialogTitle>
              </DialogHeader>
              <NewEventForm
                matters={matters}
                onCreated={handleCreated}
                onClose={() => setDialogOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">

        {/* ── Left column: mini calendar + selected day ── */}
        <div className="space-y-4">

          {/* Mini calendar */}
          <Card className="shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <CalendarDays className="h-4 w-4 text-emerald-600" />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-900 dark:text-slate-100">
                  Calendar
                </h2>
              </div>
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                modifiers={{ hasEvents: hasEventsMatcher }}
                components={{
                  DayButton: ({ day, modifiers, className, ...props }) => (
                    <CalendarDayButton
                      day={day}
                      modifiers={modifiers}
                      className={cn(
                        className,
                        modifiers.hasEvents && !modifiers.selected &&
                          'ring-1 ring-primary/70 ring-offset-1 ring-offset-background rounded-md font-semibold',
                      )}
                      {...props}
                    />
                  ),
                }}
                className="w-full"
              />
            </CardContent>
          </Card>

          {/* Selected day events */}
          <Card className="shadow-sm">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {selectedDate
                    ? selectedDate.toLocaleDateString('en-NG', { month: 'long', day: 'numeric', year: 'numeric' })
                    : 'Select a date'}
                </h3>
                <Badge variant="outline">{eventsOnDay.length}</Badge>
              </div>

              {eventsOnDay.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <CalendarOff className="h-8 w-8 text-slate-300 dark:text-slate-600" />
                  <p className="text-sm text-slate-500 dark:text-slate-400">No events on this date.</p>
                  <Button size="sm" variant="outline" className="mt-1" onClick={() => setDialogOpen(true)}>
                    <Plus className="h-3.5 w-3.5" /> Add event
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {eventsOnDay.map((event) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      matterById={matterById}
                      syncingId={syncingId}
                      deletingId={deletingId}
                      onSync={handleSync}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Right column: Upcoming events ── */}
        <Card className="shadow-sm">
          <CardContent className="p-4 sm:p-6 space-y-4">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-emerald-600" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-900 dark:text-slate-100">
                Upcoming Events
              </h2>
              <Badge variant="outline" className="text-xs">{upcomingTotal}</Badge>
            </div>

            {upcomingGrouped.length === 0 ? (
              /* Empty state */
              <div className="flex flex-col items-center gap-3 py-20 text-center">
                <div className="rounded-2xl bg-slate-100 dark:bg-slate-800 p-5">
                  <CalendarOff className="h-10 w-10 text-slate-400 dark:text-slate-500" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">No upcoming events</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-xs">
                    You have no scheduled events coming up. Create one to get started.
                  </p>
                </div>
                <Button
                  size="sm"
                  className="bg-emerald-600 text-white hover:bg-emerald-700 mt-1"
                  onClick={() => setDialogOpen(true)}
                >
                  <Plus className="h-4 w-4" /> New Event
                </Button>
              </div>
            ) : (
              /* Grouped list */
              <div className="space-y-6 overflow-y-auto max-h-[680px] pr-1 custom-scrollbar">
                {upcomingGrouped.map(([dayStr, dayEvents]) => (
                  <div key={dayStr}>
                    {/* Day heading */}
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {formatDateHeading(new Date(dayStr))}
                      </span>
                      <div className="flex-1 h-px bg-border" />
                    </div>

                    <div className="space-y-2">
                      {dayEvents.map((event) => (
                        <EventCard
                          key={event.id}
                          event={event}
                          matterById={matterById}
                          syncingId={syncingId}
                          deletingId={deletingId}
                          onSync={handleSync}
                          onDelete={handleDelete}
                          onClick={() => setSelectedDate(new Date(event.starts_at))}
                          compact
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}

export default CalendarPage;
