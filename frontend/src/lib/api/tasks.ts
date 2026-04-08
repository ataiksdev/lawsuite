import apiClient from '../api-client';

export type BackendTaskStatus = 'todo' | 'in_progress' | 'done' | 'cancelled';
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
  // Backend returns "pages" not "total_pages"
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

// FIX: Backend mounts tasks at /matters/{id}/tasks, not /tasks/{id}/tasks
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
