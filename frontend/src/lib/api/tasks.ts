import apiClient from '../api-client';

export type BackendTaskStatus = 'todo' | 'in_progress' | 'done' | 'cancelled' | 'archived';
export type BackendTaskPriority = 'low' | 'medium' | 'high';

export interface BackendTask {
  id: string;
  matter_id: string;
  organisation_id: string;
  assigned_to?: string | null;
  created_by?: string | null;
  title: string;
  notes?: string | null;
  status: BackendTaskStatus;
  priority: BackendTaskPriority;
  due_date?: string | null;
  is_deleted: boolean;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface BackendTaskListResponse {
  items: BackendTask[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface TaskUpsertPayload {
  title: string;
  notes?: string;
  priority?: BackendTaskPriority;
  assigned_to?: string;
  due_date?: string;
  status?: BackendTaskStatus;
}

export interface OverdueTask {
  id: string;
  matter_id: string;
  matter_title: string;
  matter_reference_no: string;
  title: string;
  priority: BackendTaskPriority;
  due_date: string;
  assigned_to?: string | null;
}

export interface OverdueTaskListResponse {
  items: OverdueTask[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

// ── Comments ──────────────────────────────────────────────────────────────────

export interface TaskComment {
  id: string;
  task_id: string;
  matter_id: string;
  author_id: string;
  author_name: string;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface TaskCommentPayload {
  body: string;
}

// ── Document Links ────────────────────────────────────────────────────────────

export interface TaskDocumentLinkPayload {
  document_id: string;
}

// ── Watchers ──────────────────────────────────────────────────────────────────

export interface TaskWatcher {
  user_id: string;
  full_name: string;
  email: string;
  added_at: string;
}

// ── Task CRUD ─────────────────────────────────────────────────────────────────

export async function listMatterTasks(
  matterId: string,
  params: { status?: BackendTaskStatus; page?: number; page_size?: number } = {}
) {
  return apiClient.get<BackendTaskListResponse>(`/matters/${matterId}/tasks`, params);
}

export async function createTask(matterId: string, payload: TaskUpsertPayload) {
  return apiClient.post<BackendTask>(`/matters/${matterId}/tasks`, payload);
}

export async function updateTask(
  matterId: string,
  taskId: string,
  payload: Partial<TaskUpsertPayload>
) {
  return apiClient.patch<BackendTask>(`/matters/${matterId}/tasks/${taskId}`, payload);
}

export async function deleteTask(matterId: string, taskId: string) {
  return apiClient.delete<void>(`/matters/${matterId}/tasks/${taskId}`);
}

export async function listOverdueTasks(params: { page?: number; page_size?: number } = {}) {
  return apiClient.get<OverdueTaskListResponse>('/tasks/overdue', params);
}

// ── Comments ──────────────────────────────────────────────────────────────────

export async function listTaskComments(matterId: string, taskId: string) {
  return apiClient.get<TaskComment[]>(`/matters/${matterId}/tasks/${taskId}/comments`);
}

export async function addTaskComment(
  matterId: string,
  taskId: string,
  payload: TaskCommentPayload
) {
  return apiClient.post<TaskComment>(
    `/matters/${matterId}/tasks/${taskId}/comments`,
    payload
  );
}

export async function deleteTaskComment(
  matterId: string,
  taskId: string,
  commentId: string
) {
  return apiClient.delete<void>(
    `/matters/${matterId}/tasks/${taskId}/comments/${commentId}`
  );
}

// ── Watchers ──────────────────────────────────────────────────────────────────

export async function listTaskWatchers(matterId: string, taskId: string) {
  return apiClient.get<TaskWatcher[]>(`/matters/${matterId}/tasks/${taskId}/watchers`);
}

export async function addTaskWatcher(
  matterId: string,
  taskId: string,
  userId: string
) {
  return apiClient.post<TaskWatcher>(
    `/matters/${matterId}/tasks/${taskId}/watchers`,
    { user_id: userId }
  );
}

export async function removeTaskWatcher(
  matterId: string,
  taskId: string,
  userId: string
) {
  return apiClient.delete<void>(
    `/matters/${matterId}/tasks/${taskId}/watchers/${userId}`
  );
}

// ── Document Links ────────────────────────────────────────────────────────────

export async function listTaskDocumentLinks(matterId: string, taskId: string) {
  return apiClient.get<import('./documents').BackendDocument[]>(
    `/matters/${matterId}/tasks/${taskId}/document-links`
  );
}

export async function addTaskDocumentLink(
  matterId: string,
  taskId: string,
  payload: TaskDocumentLinkPayload
) {
  return apiClient.post<import('./documents').BackendDocument>(
    `/matters/${matterId}/tasks/${taskId}/document-links`,
    payload
  );
}

export async function removeTaskDocumentLink(
  matterId: string,
  taskId: string,
  documentId: string
) {
  return apiClient.delete<void>(
    `/matters/${matterId}/tasks/${taskId}/document-links/${documentId}`
  );
}
