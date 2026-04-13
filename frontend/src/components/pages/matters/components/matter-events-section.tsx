'use client';

import React, { useEffect, useState } from 'react';
import { CalendarDays, ExternalLink, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import { handleApiError } from '@/lib/error-utils';
import {
  createMatterEvent,
  deleteMatterEvent,
  listCalendarEvents,
  syncMatterEventToGoogle,
  type BackendCalendarEvent,
  type BackendCalendarEventType,
} from '@/lib/api/calendar';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

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

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('en-NG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function MatterEventsSection({ matterId }: { matterId: string }) {
  const [events, setEvents] = useState<BackendCalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: '',
    event_type: 'court_date' as BackendCalendarEventType,
    starts_at: '',
    ends_at: '',
    location: '',
    description: '',
  });

  const loadEvents = async (silent = false) => {
    if (silent) setIsRefreshing(true);
    else setIsLoading(true);
    try {
      const response = await listCalendarEvents({ matter_id: matterId });
      setEvents(response.items);
    } catch (error) {
      handleApiError(error, 'Unable to load matter events.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    void loadEvents();
  }, [matterId]);

  const handleCreate = async () => {
    if (!form.title.trim() || !form.starts_at) return;
    setSaving(true);
    try {
      const created = await createMatterEvent(matterId, {
        title: form.title.trim(),
        event_type: form.event_type,
        starts_at: new Date(form.starts_at).toISOString(),
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : undefined,
        location: form.location.trim() || undefined,
        description: form.description.trim() || undefined,
      });
      setEvents((current) => [...current, created].sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at)));
      setForm({ title: '', event_type: 'court_date', starts_at: '', ends_at: '', location: '', description: '' });
      toast.success('Matter event added.');
    } catch (error) {
      handleApiError(error, 'Unable to create matter event.');
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async (event: BackendCalendarEvent) => {
    setSyncingId(event.id);
    try {
      const updated = await syncMatterEventToGoogle(matterId, event.id);
      setEvents((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      toast.success('Event pushed to Google Calendar.');
    } catch (error) {
      handleApiError(error, 'Unable to push event to Google Calendar.');
    } finally {
      setSyncingId(null);
    }
  };

  const handleDelete = async (event: BackendCalendarEvent) => {
    setDeletingId(event.id);
    try {
      await deleteMatterEvent(matterId, event.id);
      setEvents((current) => current.filter((item) => item.id !== event.id));
      toast.success('Event removed.');
    } catch (error) {
      handleApiError(error, 'Unable to remove event.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Card className="shadow-sm lg:col-span-2">
      <CardContent className="space-y-4 p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-slate-500" />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-900 dark:text-slate-100">
              Calendar
            </h3>
            <Badge variant="outline">{events.length}</Badge>
          </div>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => void loadEvents(true)} disabled={isRefreshing}>
            <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
            Refresh
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label>Event title</Label>
            <Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Court mention, filing deadline, client meeting..." />
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={form.event_type} onValueChange={(value) => setForm((current) => ({ ...current, event_type: value as BackendCalendarEventType }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(EVENT_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Location</Label>
            <Input value={form.location} onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))} placeholder="Court 4, registry, Zoom..." />
          </div>
          <div className="space-y-2">
            <Label>Starts</Label>
            <Input type="datetime-local" value={form.starts_at} onChange={(event) => setForm((current) => ({ ...current, starts_at: event.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Ends</Label>
            <Input type="datetime-local" value={form.ends_at} onChange={(event) => setForm((current) => ({ ...current, ends_at: event.target.value }))} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Description</Label>
            <Textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} rows={3} placeholder="Optional detail for the calendar event" />
          </div>
        </div>

        <Button onClick={() => void handleCreate()} disabled={saving || !form.title.trim() || !form.starts_at} className="bg-emerald-600 text-white hover:bg-emerald-700">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Add Event
        </Button>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-400 py-4">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading events…
          </div>
        ) : events.length === 0 ? (
          <p className="text-sm text-slate-500">No court dates or deadlines linked to this matter yet.</p>
        ) : (
          <div className="space-y-3">
            {events.map((event) => (
              <div key={event.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">{event.title}</p>
                      <Badge className={cn('border text-[10px]', eventStyle(event.event_type))}>
                        {EVENT_LABELS[event.event_type]}
                      </Badge>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">{formatDateTime(event.starts_at)}</p>
                    {event.location && <p className="mt-1 text-xs text-slate-500">{event.location}</p>}
                    {event.description && <p className="mt-2 text-sm text-slate-600">{event.description}</p>}
                    {event.google_last_error && <p className="mt-2 text-xs text-red-500">{event.google_last_error}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => void handleSync(event)} disabled={syncingId === event.id}>
                      {syncingId === event.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                      Push to Google
                    </Button>
                    {event.google_event_url && (
                      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => window.open(event.google_event_url || '', '_blank', 'noopener,noreferrer')}>
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                        Open Google
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="h-8 text-xs text-red-600 hover:bg-red-50" onClick={() => void handleDelete(event)} disabled={deletingId === event.id}>
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default MatterEventsSection;
