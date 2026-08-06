// ============================================================================
// Lawmate - Desktop Sync Bridge Types
// The actual implementation lives in the Electron preload script
// (desktop/src/preload.ts) and is only ever present when this frontend is
// running inside the desktop app shell — window.desktopSync is undefined
// on the hosted cloud site. Components must check for its presence before
// use; NEXT_PUBLIC_DESKTOP_BUILD gates whether the UI renders at all, this
// interface is what it talks to once rendered.
// ============================================================================

export interface SyncConflict {
  table: string;
  id: string;
  label: string;
  localUpdatedAt: string | null;
  cloudUpdatedAt: string | null;
}

export type SyncResult =
  | { status: 'no_changes' }
  | { status: 'synced'; pushed: number; pulled: number }
  | { status: 'conflicts'; conflicts: SyncConflict[] }
  | { status: 'error'; message: string };

export interface SyncStatus {
  connected: boolean;
  cloudUrl: string | null;
  lastSyncedAt: string | null;
}

export interface DesktopSyncBridge {
  getStatus(): Promise<SyncStatus>;
  connect(cloudUrl: string, email: string, password: string): Promise<{ success: boolean; error?: string }>;
  disconnect(): Promise<void>;
  syncNow(options?: { forceThroughConflicts?: boolean }): Promise<SyncResult>;
}

declare global {
  interface Window {
    desktopSync?: DesktopSyncBridge;
  }
}

export function isDesktopBuild(): boolean {
  return process.env.NEXT_PUBLIC_DESKTOP_BUILD === '1';
}

export function getDesktopSyncBridge(): DesktopSyncBridge | null {
  if (typeof window === 'undefined') return null;
  return window.desktopSync ?? null;
}
