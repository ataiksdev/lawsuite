// frontend/src/hooks/use-notifications-sse.ts
/**
 * SSE hook — connects to /notifications/stream and keeps the notification
 * store in sync with the server in real-time.
 *
 * - Opens an EventSource on mount.
 * - Handles `notification`, `unread`, and `ping` events.
 * - Tears down the connection on unmount or when the user logs out.
 * - Back-fills with a full list fetch on first connect so the store
 *   starts populated even before the stream fires anything.
 */
'use client';

import { useEffect, useRef } from 'react';
import { useNotificationStore } from '@/components/layout/app-shell';
import { useAuthStore } from '@/lib/auth-store';
import { listNotifications, type BackendNotification } from '@/lib/api/notifications';
import apiClient from '@/lib/api-client';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export function useNotificationsSSE() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { setNotifications, addNotification, setUnreadCount } = useNotificationStore();
  const esRef = useRef<EventSource | null>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);

  useEffect(() => {
    if (!isAuthenticated) {
      // Clean up any open connection when logged out
      esRef.current?.close();
      esRef.current = null;
      return;
    }

    // Initial populate — fetch the most recent notifications right away
    listNotifications({ limit: 50 })
      .then((notifications) => setNotifications(mapAll(notifications)))
      .catch(() => {/* non-fatal */});

    function connect() {
      const token = apiClient.getAccessToken();
      if (!token) return;

      // EventSource doesn't support custom headers, so we pass the token
      // as a query param. The backend's get_current_user reads it.
      const url = `${BASE_URL}/notifications/stream?token=${encodeURIComponent(token)}`;
      const es = new EventSource(url, { withCredentials: true });
      esRef.current = es;

      es.addEventListener('notification', (e: MessageEvent) => {
        try {
          const raw: BackendNotification = JSON.parse(e.data as string);
          addNotification(mapOne(raw));
        } catch {
          // Malformed event — ignore
        }
      });

      es.addEventListener('unread', (e: MessageEvent) => {
        try {
          const { count } = JSON.parse(e.data as string) as { count: number };
          setUnreadCount(count);
        } catch {/* ignore */}
      });

      es.addEventListener('ping', () => {
        // Heartbeat received — connection is alive, reset retry counter
        retryCountRef.current = 0;
      });

      es.onerror = () => {
        es.close();
        esRef.current = null;
        // Exponential backoff: 2s, 4s, 8s … capped at 60s
        const delay = Math.min(2000 * 2 ** retryCountRef.current, 60_000);
        retryCountRef.current += 1;
        retryTimeoutRef.current = setTimeout(() => {
          if (isAuthenticated) connect();
        }, delay);
      };
    }

    connect();

    return () => {
      esRef.current?.close();
      esRef.current = null;
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    };
  }, [isAuthenticated]);  // eslint-disable-line react-hooks/exhaustive-deps
}

// ── Token-in-query-param support ─────────────────────────────────────────────
// The FastAPI deps.py reads Authorization: Bearer … but EventSource can't set
// custom headers. We need a tiny extra dependency in the backend to also accept
// a `?token=` query param for SSE routes.  See: app/core/deps.py patch below.

// ── Mapping helpers ───────────────────────────────────────────────────────────

function mapOne(n: BackendNotification) {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    link: n.link ?? undefined,
    is_read: n.is_read,
    created_at: n.created_at,
  };
}

function mapAll(notifications: BackendNotification[]) {
  return notifications.map(mapOne);
}
