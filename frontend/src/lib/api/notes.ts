// frontend/src/lib/api/notes.ts
import apiClient from '../api-client';

export type NoteType = 'typed' | 'handwritten' | 'mixed';

export interface BackendNote {
  id: string;
  matter_id?: string | null;
  event_id?: string | null;
  task_id?: string | null;
  organisation_id: string;
  author_id?: string | null;
  created_from_task_comment_id?: string | null;
  author_name: string;
  title: string;
  body?: string | null;
  svg_content?: string | null;
  note_type: NoteType;
  created_at: string;
  updated_at: string;
}

export interface NoteCreatePayload {
  title: string;
  body?: string;
  svg_content?: string;
  matter_id?: string;
  event_id?: string;
  task_id?: string;
}

export interface NoteUpdatePayload {
  title?: string;
  body?: string;
  svg_content?: string;
  matter_id?: string | null;
  event_id?: string | null;
  task_id?: string | null;
}

export interface AddCommentToNotePayload {
  task_id: string;
  comment_id: string;
}

export async function listNotes(params: {
  matter_id?: string;
  event_id?: string;
  task_id?: string;
  limit?: number;
} = {}): Promise<BackendNote[]> {
  return apiClient.get<BackendNote[]>('/notes', params as Record<string, string | number | undefined>);
}

export async function getNote(noteId: string): Promise<BackendNote> {
  return apiClient.get<BackendNote>(`/notes/${noteId}`);
}

export async function createNote(payload: NoteCreatePayload): Promise<BackendNote> {
  return apiClient.post<BackendNote>('/notes', payload);
}

export async function updateNote(noteId: string, payload: NoteUpdatePayload): Promise<BackendNote> {
  return apiClient.patch<BackendNote>(`/notes/${noteId}`, payload);
}

export async function deleteNote(noteId: string): Promise<void> {
  return apiClient.delete<void>(`/notes/${noteId}`);
}

export async function addCommentToNote(
  noteId: string,
  payload: AddCommentToNotePayload
): Promise<BackendNote> {
  return apiClient.post<BackendNote>(`/notes/${noteId}/add-comment`, payload);
}
