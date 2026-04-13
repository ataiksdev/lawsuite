import apiClient from '../api-client';

export type BackendCalendarEventType = 'court_date' | 'deadline' | 'meeting' | 'reminder' | 'other';
export type BackendCalendarSyncStatus = 'never_synced' | 'synced' | 'sync_error';
export type BackendMatterNoteType = 'typed' | 'handwritten' | 'mixed';

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

export interface BackendMatterNote {
  id: string;
  matter_id: string;
  event_id?: string | null;
  organisation_id: string;
  author_id?: string | null;
  created_from_task_comment_id?: string | null;
  author_name: string;
  title: string;
  body?: string | null;
  svg_content?: string | null;
  note_type: BackendMatterNoteType;
  created_at: string;
  updated_at: string;
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

export interface MatterNotePayload {
  title: string;
  body?: string;
  svg_content?: string;
  event_id?: string;
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

export async function listMatterNotes(matterId: string, params: { event_id?: string } = {}) {
  return apiClient.get<BackendMatterNote[]>(`/calendar/matters/${matterId}/notes`, params);
}

export async function createMatterNote(matterId: string, payload: MatterNotePayload) {
  return apiClient.post<BackendMatterNote>(`/calendar/matters/${matterId}/notes`, payload);
}

export async function updateMatterNote(
  matterId: string,
  noteId: string,
  payload: Partial<MatterNotePayload>
) {
  return apiClient.patch<BackendMatterNote>(`/calendar/matters/${matterId}/notes/${noteId}`, payload);
}

export async function deleteMatterNote(matterId: string, noteId: string) {
  return apiClient.delete<void>(`/calendar/matters/${matterId}/notes/${noteId}`);
}

export async function listRecentMatterNotes(limit = 20) {
  return apiClient.get<BackendMatterNote[]>('/calendar/notes/recent', { limit });
}

export async function addTaskCommentToMatterNote(
  matterId: string,
  taskId: string,
  commentId: string,
  noteId: string
) {
  return apiClient.post<BackendMatterNote>(
    `/calendar/matters/${matterId}/tasks/${taskId}/comments/${commentId}/add-to-note`,
    { note_id: noteId }
  );
}
