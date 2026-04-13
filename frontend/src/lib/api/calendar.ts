import apiClient from '../api-client';

export type BackendCalendarEventType = 'court_date' | 'deadline' | 'meeting' | 'reminder' | 'other';
export type BackendCalendarSyncStatus = 'never_synced' | 'synced' | 'sync_error';

export interface BackendCalendarEvent {
  id: string;
  matter_id: string;
  organisation_id: string;
  created_by?: string | null;
  title: string;
  description?: string | null;
  event_type: BackendCalendarEventType;
  location?: string | null;
  starts_at: string;
  ends_at?: string | null;
  all_day: boolean;
  google_event_id?: string | null;
  google_event_url?: string | null;
  google_sync_status: BackendCalendarSyncStatus;
  google_synced_at?: string | null;
  google_last_error?: string | null;
  created_at: string;
  updated_at: string;
}

export interface BackendCalendarEventListResponse {
  items: BackendCalendarEvent[];
  total: number;
}

export interface CalendarEventPayload {
  title: string;
  description?: string;
  event_type?: BackendCalendarEventType;
  location?: string;
  starts_at: string;
  ends_at?: string;
  all_day?: boolean;
}

export async function listCalendarEvents(params: {
  starts_from?: string;
  ends_before?: string;
  matter_id?: string;
} = {}) {
  return apiClient.get<BackendCalendarEventListResponse>('/calendar/events', params);
}

export async function createMatterEvent(matterId: string, payload: CalendarEventPayload) {
  return apiClient.post<BackendCalendarEvent>(`/calendar/matters/${matterId}/events`, payload);
}

export async function updateMatterEvent(
  matterId: string,
  eventId: string,
  payload: Partial<CalendarEventPayload>
) {
  return apiClient.patch<BackendCalendarEvent>(`/calendar/matters/${matterId}/events/${eventId}`, payload);
}

export async function deleteMatterEvent(matterId: string, eventId: string) {
  return apiClient.delete<void>(`/calendar/matters/${matterId}/events/${eventId}`);
}

export async function syncMatterEventToGoogle(matterId: string, eventId: string) {
  return apiClient.post<BackendCalendarEvent>(`/calendar/matters/${matterId}/events/${eventId}/sync`, {});
}

export async function unsyncMatterEventFromGoogle(matterId: string, eventId: string) {
  return apiClient.delete<BackendCalendarEvent>(`/calendar/matters/${matterId}/events/${eventId}/sync`);
}
