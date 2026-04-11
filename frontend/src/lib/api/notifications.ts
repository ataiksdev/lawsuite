// frontend/src/lib/api/notifications.ts
import apiClient from '../api-client';

export interface BackendNotification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  link?: string | null;
  is_read: boolean;
  created_at: string;
}

export async function listNotifications(params: {
  unread_only?: boolean;
  limit?: number;
} = {}): Promise<BackendNotification[]> {
  return apiClient.get<BackendNotification[]>('/notifications', params as Record<string, string | number | boolean | undefined>);
}

export async function getUnreadCount(): Promise<{ count: number }> {
  return apiClient.get<{ count: number }>('/notifications/unread-count');
}

export async function markNotificationRead(id: string): Promise<{ id: string; is_read: boolean }> {
  return apiClient.patch<{ id: string; is_read: boolean }>(`/notifications/${id}/read`);
}

export async function markAllNotificationsRead(): Promise<{ marked_read: number }> {
  return apiClient.post<{ marked_read: number }>('/notifications/read-all');
}

export async function deleteNotification(id: string): Promise<void> {
  return apiClient.delete<void>(`/notifications/${id}`);
}
