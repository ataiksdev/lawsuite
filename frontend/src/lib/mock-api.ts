// ============================================================================
// Lawmate - Demo Mode Mock API
// Intercepts apiClient requests while Demo Mode is active and serves an
// in-memory, mutable copy of mock-data.ts instead of calling the real
// backend. Reads AND writes are supported — creating, editing, and deleting
// records updates this in-memory state so the demo feels real — but nothing
// here ever touches the real database, and all state resets on page reload.
// Endpoints without a handler fall through to the real backend call.
// ============================================================================

import {
  mockMatters,
  mockClients,
  mockTasks,
  mockUsers,
  mockDocuments,
  mockActivities,
  mockNotifications,
  mockBillingInfo,
  mockIntegrations,
} from './mock-data';

const DEMO_USER_ID = 'user-001';
const DEMO_USER_NAME = 'Chukwuma Adebayo';
const ORG_ID = 'org-001';

interface PageParams {
  page?: number | string;
  page_size?: number | string;
  [key: string]: unknown;
}

function paginate<T>(items: T[], params: PageParams = {}) {
  const page = Number(params.page) || 1;
  const pageSize = Number(params.page_size) || 20;
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    total: items.length,
    page,
    page_size: pageSize,
    pages: Math.max(1, Math.ceil(items.length / pageSize)),
  };
}

let seq = 1000;
function genId(prefix: string): string {
  seq += 1;
  return `${prefix}-demo-${seq}`;
}
function nowIso(): string {
  return new Date().toISOString();
}

// ── Adapters: mock-data.ts shapes -> real backend response shapes ──────────
// Used once, at module load, to seed the mutable state below.

function adaptMatter(m: (typeof mockMatters)[number]) {
  return {
    id: m.id,
    organisation_id: ORG_ID,
    client_id: m.client_id,
    client: m.client ? { id: m.client.id, name: m.client.name, email: m.client.email ?? null } : null,
    assigned_to: m.assigned_to ?? null,
    title: m.title,
    reference_no: m.matter_number,
    matter_type: m.matter_type as string,
    status: m.status as string,
    description: m.description ?? null,
    drive_folder_url: null as string | null,
    drive_folder_id: null as string | null,
    opened_at: m.created_at,
    target_close_at: null as string | null,
    closed_at: (m.status === 'closed' ? m.updated_at : null) as string | null,
    created_at: m.created_at,
    updated_at: m.updated_at,
  };
}
type Matter = ReturnType<typeof adaptMatter>;

function adaptClient(c: (typeof mockClients)[number]) {
  return {
    id: c.id,
    organisation_id: ORG_ID,
    name: c.name,
    email: c.email ?? null,
    phone: c.phone ?? null,
    address: c.address ?? null,
    notes: c.notes ?? null,
    is_active: c.is_active,
    created_at: c.created_at,
    updated_at: c.updated_at,
  };
}
type Client = ReturnType<typeof adaptClient>;

function adaptTask(t: (typeof mockTasks)[number]) {
  return {
    id: t.id,
    matter_id: t.matter_id ?? '',
    organisation_id: ORG_ID,
    assigned_to: t.assigned_to ?? null,
    created_by: null as string | null,
    title: t.title,
    notes: t.description ?? null,
    status: t.status as string,
    priority: t.priority as string,
    due_date: t.due_date ?? null,
    is_deleted: false,
    completed_at: t.completed_at ?? null,
    created_at: t.created_at,
    updated_at: t.updated_at,
  };
}
type Task = ReturnType<typeof adaptTask>;

function adaptMember(u: (typeof mockUsers)[number]) {
  return {
    id: u.id,
    email: u.email,
    full_name: `${u.first_name} ${u.last_name}`.trim(),
    role: u.role as string,
    is_active: u.is_active,
    is_verified: true,
    joined_at: u.created_at,
    has_pending_invite: false,
  };
}
type Member = ReturnType<typeof adaptMember>;

function adaptNotification(n: (typeof mockNotifications)[number]) {
  return {
    id: n.id,
    type: n.type as string,
    title: n.title,
    message: n.message,
    link: n.link ?? null,
    is_read: n.is_read,
    created_at: n.created_at,
  };
}
type NotificationItem = ReturnType<typeof adaptNotification>;

function adaptDocument(d: (typeof mockDocuments)[number]) {
  return {
    id: d.id,
    matter_id: d.matter_id ?? '',
    organisation_id: ORG_ID,
    name: d.title,
    doc_type: d.document_type as string,
    status: d.status as string,
    current_version: d.version,
    drive_file_id: null as string | null,
    drive_url: null as string | null,
    added_by: d.uploaded_by ?? null,
    added_at: d.created_at,
    updated_at: d.updated_at,
    versions: [] as Array<{
      id: string; document_id: string; version_number: number; label: string | null;
      drive_file_id: string; drive_url: string; notes: string | null;
      uploaded_by: string | null; uploaded_at: string;
    }>,
  };
}
type Document = ReturnType<typeof adaptDocument>;

interface CalendarEvent {
  id: string; matter_id: string; organisation_id: string; created_by: string | null;
  title: string; description: string | null; event_type: string; location: string | null;
  starts_at: string; ends_at: string | null; all_day: boolean;
  google_event_id: string | null; google_event_url: string | null;
  google_sync_status: string; google_synced_at: string | null; google_last_error: string | null;
  created_at: string; updated_at: string;
}

interface Note {
  id: string; matter_id: string | null; event_id: string | null; task_id: string | null;
  organisation_id: string; author_id: string | null; author_name: string;
  title: string; body: string | null; svg_content: string | null; note_type: string;
  created_at: string; updated_at: string;
}

interface TaskComment {
  id: string; task_id: string; matter_id: string; author_id: string; author_name: string;
  body: string; created_at: string; updated_at: string;
}

interface TaskWatcher { user_id: string; full_name: string; email: string; added_at: string }

interface ReportRecord {
  id: string; organisation_id: string; title: string; period_label: string;
  date_from: string; date_to: string; drive_file_id: string | null; drive_url: string | null;
  generated_at: string; created_by: string | null;
}

function matterIdForActivity(a: (typeof mockActivities)[number]): string | undefined {
  if (a.entity_type === 'matter') return a.entity_id;
  if (a.entity_type === 'task') return mockTasks.find((t) => t.id === a.entity_id)?.matter_id;
  if (a.entity_type === 'document') return mockDocuments.find((d) => d.id === a.entity_id)?.matter_id;
  return undefined;
}

const BILLING_PLAN_MAP: Record<string, string> = { free: 'free', professional: 'pro', agency: 'agency' };

// ── Mutable in-memory state, seeded once from mock-data.ts ─────────────────

const state = {
  matters: mockMatters.map(adaptMatter) as Matter[],
  clients: mockClients.map(adaptClient) as Client[],
  tasks: mockTasks.map(adaptTask) as Task[],
  members: mockUsers.map(adaptMember) as Member[],
  notifications: mockNotifications.map(adaptNotification) as NotificationItem[],
  documents: mockDocuments.map(adaptDocument) as Document[],
  notes: [] as Note[],
  calendarEvents: mockMatters
    .filter((mm) => mm.hearing_date)
    .map((mm): CalendarEvent => ({
      id: `cal-${mm.id}`,
      matter_id: mm.id,
      organisation_id: ORG_ID,
      created_by: mm.assigned_to ?? null,
      title: `Hearing — ${mm.title}`,
      description: mm.next_action ?? null,
      event_type: 'court_date',
      location: mm.court ?? null,
      starts_at: mm.hearing_date!,
      ends_at: null,
      all_day: false,
      google_event_id: null,
      google_event_url: null,
      google_sync_status: 'never_synced',
      google_synced_at: null,
      google_last_error: null,
      created_at: mm.created_at,
      updated_at: mm.updated_at,
    })),
  taskComments: {} as Record<string, TaskComment[]>,
  taskWatchers: {} as Record<string, TaskWatcher[]>,
  taskDocumentLinks: {} as Record<string, Document[]>,
  reports: [] as ReportRecord[],
  googleConnected: mockIntegrations.find((i) => i.slug === 'google-workspace')?.is_connected ?? false,
};

// ── Resolver ────────────────────────────────────────────────────────────────

export type MockResult =
  | { handled: true; data: unknown }
  | { handled: true; error: { status: number; detail: string } }
  | { handled: false };

const BLOCKED = (detail: string, status = 403): MockResult => ({ handled: true, error: { status, detail } });

export function resolveMockRequest(
  method: string,
  path: string,
  params: Record<string, unknown> = {},
  body?: unknown
): MockResult {
  const p = path.replace(/\/+$/, '') || '/';
  const b = (body ?? {}) as Record<string, unknown>;
  let m: RegExpMatchArray | null;

  // ── Matters ────────────────────────────────────────────────────────────
  if (method === 'GET' && (m = p.match(/^\/matters\/([^/]+)\/tasks$/))) {
    const items = state.tasks.filter((t) => t.matter_id === m![1]);
    return { handled: true, data: paginate(items, params) };
  }
  if (method === 'GET' && (m = p.match(/^\/matters\/([^/]+)\/activity$/))) {
    const matterId = m[1];
    const items = mockActivities
      .filter((a) => matterIdForActivity(a) === matterId)
      .map((a) => ({
        id: a.id,
        event_type: a.action.replace('.', '_'),
        payload: { title: a.description },
        actor_id: a.user?.id ?? null,
        created_at: a.created_at,
        matter_id: matterId,
      }));
    return { handled: true, data: { items, total: items.length } };
  }
  if (method === 'GET' && (m = p.match(/^\/matters\/([^/]+)\/documents$/))) {
    return { handled: true, data: state.documents.filter((d) => d.matter_id === m![1]) };
  }
  if (method === 'GET' && /^\/matters\/[^/]+\/(drive-files|templates)$/.test(p)) {
    return { handled: true, data: [] };
  }
  if (method === 'GET' && (m = p.match(/^\/matters\/([^/]+)$/))) {
    return { handled: true, data: state.matters.find((mm) => mm.id === m![1]) ?? null };
  }
  if (method === 'GET' && p === '/matters') {
    let items = state.matters.slice();
    if (params.status) items = items.filter((mm) => mm.status === params.status);
    if (params.client_id) items = items.filter((mm) => mm.client_id === params.client_id);
    if (params.assigned_to) items = items.filter((mm) => mm.assigned_to === params.assigned_to);
    if (params.search) {
      const q = String(params.search).toLowerCase();
      items = items.filter((mm) => mm.title.toLowerCase().includes(q));
    }
    return { handled: true, data: paginate(items, params) };
  }
  if (method === 'POST' && p === '/matters') {
    const client = state.clients.find((c) => c.id === b.client_id);
    const newMatter: Matter = {
      id: genId('matter'),
      organisation_id: ORG_ID,
      client_id: (b.client_id as string) ?? '',
      client: client ? { id: client.id, name: client.name, email: client.email } : null,
      assigned_to: (b.assigned_to as string) ?? null,
      title: (b.title as string) ?? 'Untitled Matter',
      reference_no: `MAT-${new Date().getFullYear()}-${String(state.matters.length + 1).padStart(3, '0')}`,
      matter_type: (b.matter_type as string) ?? 'advisory',
      status: 'intake',
      description: (b.description as string) ?? null,
      drive_folder_url: null,
      drive_folder_id: null,
      opened_at: nowIso(),
      target_close_at: (b.target_close_at as string) ?? null,
      closed_at: null,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    state.matters.unshift(newMatter);
    return { handled: true, data: newMatter };
  }
  if (method === 'PATCH' && (m = p.match(/^\/matters\/([^/]+)\/status$/))) {
    const matter = state.matters.find((mm) => mm.id === m![1]);
    if (!matter) return { handled: true, data: null };
    matter.status = b.status as string;
    matter.updated_at = nowIso();
    if (matter.status === 'closed') matter.closed_at = nowIso();
    return { handled: true, data: matter };
  }
  if (method === 'PATCH' && (m = p.match(/^\/matters\/([^/]+)$/))) {
    const matter = state.matters.find((mm) => mm.id === m![1]);
    if (!matter) return { handled: true, data: null };
    if (typeof b.title === 'string') matter.title = b.title;
    if (typeof b.description === 'string') matter.description = b.description;
    if (typeof b.assigned_to === 'string') matter.assigned_to = b.assigned_to;
    if (typeof b.matter_type === 'string') matter.matter_type = b.matter_type;
    if (typeof b.target_close_at === 'string') matter.target_close_at = b.target_close_at;
    if (typeof b.client_id === 'string') {
      matter.client_id = b.client_id;
      const client = state.clients.find((c) => c.id === b.client_id);
      matter.client = client ? { id: client.id, name: client.name, email: client.email } : null;
    }
    matter.updated_at = nowIso();
    return { handled: true, data: matter };
  }
  if (method === 'POST' && (m = p.match(/^\/matters\/([^/]+)\/drive-folder(\/(sync|create))?$/))) {
    return {
      handled: true,
      data: { folder_id: genId('folder'), folder_name: 'Demo Drive Folder', folder_url: '#', file_count: 0, imported_count: 0 },
    };
  }

  // ── Matter tasks ───────────────────────────────────────────────────────
  if (method === 'POST' && (m = p.match(/^\/matters\/([^/]+)\/tasks$/))) {
    const newTask: Task = {
      id: genId('task'),
      matter_id: m[1],
      organisation_id: ORG_ID,
      assigned_to: (b.assigned_to as string) ?? null,
      created_by: DEMO_USER_ID,
      title: (b.title as string) ?? 'Untitled Task',
      notes: (b.notes as string) ?? null,
      status: (b.status as string) ?? 'todo',
      priority: (b.priority as string) ?? 'medium',
      due_date: (b.due_date as string) ?? null,
      is_deleted: false,
      completed_at: null,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    state.tasks.unshift(newTask);
    return { handled: true, data: newTask };
  }
  if (method === 'PATCH' && (m = p.match(/^\/matters\/[^/]+\/tasks\/([^/]+)$/))) {
    const task = state.tasks.find((t) => t.id === m![1]);
    if (!task) return { handled: true, data: null };
    if (typeof b.title === 'string') task.title = b.title;
    if (typeof b.notes === 'string') task.notes = b.notes;
    if (typeof b.priority === 'string') task.priority = b.priority;
    if (typeof b.assigned_to === 'string') task.assigned_to = b.assigned_to;
    if (typeof b.due_date === 'string') task.due_date = b.due_date;
    if (typeof b.status === 'string') {
      task.status = b.status;
      task.completed_at = b.status === 'done' ? nowIso() : null;
    }
    task.updated_at = nowIso();
    return { handled: true, data: task };
  }
  if (method === 'DELETE' && (m = p.match(/^\/matters\/[^/]+\/tasks\/([^/]+)$/))) {
    state.tasks = state.tasks.filter((t) => t.id !== m![1]);
    return { handled: true, data: undefined };
  }
  if (method === 'GET' && p === '/tasks/overdue') {
    const now = Date.now();
    const items = state.tasks
      .filter((t) => t.due_date && t.status !== 'done' && t.status !== 'cancelled' && new Date(t.due_date).getTime() < now)
      .map((t) => {
        const matter = state.matters.find((mm) => mm.id === t.matter_id);
        return {
          id: t.id,
          matter_id: t.matter_id,
          matter_title: matter?.title ?? '',
          matter_reference_no: matter?.reference_no ?? '',
          title: t.title,
          priority: t.priority,
          due_date: t.due_date!,
          assigned_to: t.assigned_to,
        };
      });
    return { handled: true, data: paginate(items, params) };
  }

  // ── Task comments / watchers / document links ─────────────────────────
  if ((m = p.match(/^\/matters\/[^/]+\/tasks\/([^/]+)\/comments$/))) {
    const taskId = m[1];
    if (method === 'GET') return { handled: true, data: state.taskComments[taskId] ?? [] };
    if (method === 'POST') {
      const comment: TaskComment = {
        id: genId('comment'), task_id: taskId, matter_id: state.tasks.find((t) => t.id === taskId)?.matter_id ?? '',
        author_id: DEMO_USER_ID, author_name: DEMO_USER_NAME, body: (b.body as string) ?? '',
        created_at: nowIso(), updated_at: nowIso(),
      };
      (state.taskComments[taskId] ??= []).push(comment);
      return { handled: true, data: comment };
    }
  }
  if (method === 'DELETE' && (m = p.match(/^\/matters\/[^/]+\/tasks\/([^/]+)\/comments\/([^/]+)$/))) {
    const [, taskId, commentId] = m;
    state.taskComments[taskId] = (state.taskComments[taskId] ?? []).filter((c) => c.id !== commentId);
    return { handled: true, data: undefined };
  }
  if ((m = p.match(/^\/matters\/[^/]+\/tasks\/([^/]+)\/watchers$/))) {
    const taskId = m[1];
    if (method === 'GET') return { handled: true, data: state.taskWatchers[taskId] ?? [] };
    if (method === 'POST') {
      const member = state.members.find((mm) => mm.id === b.user_id);
      const watcher: TaskWatcher = {
        user_id: (b.user_id as string) ?? '', full_name: member?.full_name ?? 'Team member',
        email: member?.email ?? '', added_at: nowIso(),
      };
      (state.taskWatchers[taskId] ??= []).push(watcher);
      return { handled: true, data: watcher };
    }
  }
  if (method === 'DELETE' && (m = p.match(/^\/matters\/[^/]+\/tasks\/([^/]+)\/watchers\/([^/]+)$/))) {
    const [, taskId, userId] = m;
    state.taskWatchers[taskId] = (state.taskWatchers[taskId] ?? []).filter((w) => w.user_id !== userId);
    return { handled: true, data: undefined };
  }
  if ((m = p.match(/^\/matters\/[^/]+\/tasks\/([^/]+)\/document-links$/))) {
    const taskId = m[1];
    if (method === 'GET') return { handled: true, data: state.taskDocumentLinks[taskId] ?? [] };
    if (method === 'POST') {
      const doc = state.documents.find((d) => d.id === b.document_id);
      if (doc) (state.taskDocumentLinks[taskId] ??= []).push(doc);
      return { handled: true, data: doc ?? null };
    }
  }
  if (method === 'DELETE' && (m = p.match(/^\/matters\/[^/]+\/tasks\/([^/]+)\/document-links\/([^/]+)$/))) {
    const [, taskId, documentId] = m;
    state.taskDocumentLinks[taskId] = (state.taskDocumentLinks[taskId] ?? []).filter((d) => d.id !== documentId);
    return { handled: true, data: undefined };
  }

  // ── Clients ────────────────────────────────────────────────────────────
  if (method === 'GET' && (m = p.match(/^\/clients\/([^/]+)$/))) {
    return { handled: true, data: state.clients.find((c) => c.id === m![1]) ?? null };
  }
  if (method === 'GET' && p === '/clients') {
    let items = state.clients.slice();
    if (!params.include_inactive) items = items.filter((c) => c.is_active);
    if (params.search) {
      const q = String(params.search).toLowerCase();
      items = items.filter((c) => c.name.toLowerCase().includes(q));
    }
    return { handled: true, data: paginate(items, params) };
  }
  if (method === 'POST' && p === '/clients') {
    const newClient: Client = {
      id: genId('client'), organisation_id: ORG_ID, name: (b.name as string) ?? 'Untitled Client',
      email: (b.email as string) ?? null, phone: (b.phone as string) ?? null, address: (b.address as string) ?? null,
      notes: (b.notes as string) ?? null, is_active: true, created_at: nowIso(), updated_at: nowIso(),
    };
    state.clients.unshift(newClient);
    return { handled: true, data: newClient };
  }
  if (method === 'PATCH' && (m = p.match(/^\/clients\/([^/]+)$/))) {
    const client = state.clients.find((c) => c.id === m![1]);
    if (!client) return { handled: true, data: null };
    if (typeof b.name === 'string') client.name = b.name;
    if (typeof b.email === 'string') client.email = b.email;
    if (typeof b.phone === 'string') client.phone = b.phone;
    if (typeof b.address === 'string') client.address = b.address;
    if (typeof b.notes === 'string') client.notes = b.notes;
    client.updated_at = nowIso();
    return { handled: true, data: client };
  }
  if (method === 'DELETE' && (m = p.match(/^\/clients\/([^/]+)$/))) {
    const client = state.clients.find((c) => c.id === m![1]);
    if (client) { client.is_active = false; client.updated_at = nowIso(); }
    return { handled: true, data: undefined };
  }

  // ── Members ────────────────────────────────────────────────────────────
  if (method === 'GET' && p === '/auth/members') {
    return { handled: true, data: state.members };
  }
  if (method === 'POST' && p === '/auth/invite') {
    const newMember: Member = {
      id: genId('user'), email: (b.email as string) ?? '', full_name: (b.full_name as string) ?? 'New Member',
      role: (b.role as string) ?? 'member', is_active: false, is_verified: false, joined_at: nowIso(), has_pending_invite: true,
    };
    state.members.push(newMember);
    return { handled: true, data: { message: 'Invitation sent.', user_id: newMember.id, invite_url: `https://demo.lawmate.app/accept-invite/${newMember.id}` } };
  }
  if (method === 'POST' && (m = p.match(/^\/auth\/members\/([^/]+)\/resend-invite$/))) {
    return { handled: true, data: { message: 'Invitation resent.', invite_url: `https://demo.lawmate.app/accept-invite/${m[1]}` } };
  }
  if (method === 'PATCH' && (m = p.match(/^\/auth\/members\/([^/]+)\/role$/))) {
    const member = state.members.find((mm) => mm.id === m![1]);
    if (member) member.role = b.role as string;
    return { handled: true, data: member ?? null };
  }
  if (method === 'DELETE' && (m = p.match(/^\/auth\/members\/([^/]+)$/))) {
    state.members = state.members.filter((mm) => mm.id !== m![1]);
    return { handled: true, data: undefined };
  }
  if (method === 'GET' && p === '/auth/my-orgs') {
    return {
      handled: true,
      data: [{ id: ORG_ID, name: 'Adebayo, Okonkwo & Associates', slug: 'adebayo-okonkwo', plan: 'professional', role: 'admin', is_current: true }],
    };
  }

  // ── Notifications ──────────────────────────────────────────────────────
  if (method === 'GET' && p === '/notifications/unread-count') {
    return { handled: true, data: { count: state.notifications.filter((n) => !n.is_read).length } };
  }
  if (method === 'GET' && p === '/notifications') {
    let items = state.notifications.slice();
    if (params.unread_only) items = items.filter((n) => !n.is_read);
    const limit = Number(params.limit) || items.length;
    return { handled: true, data: items.slice(0, limit) };
  }
  if (method === 'PATCH' && (m = p.match(/^\/notifications\/([^/]+)\/read$/))) {
    const n = state.notifications.find((x) => x.id === m![1]);
    if (n) n.is_read = true;
    return { handled: true, data: { id: m[1], is_read: true } };
  }
  if (method === 'POST' && p === '/notifications/read-all') {
    let count = 0;
    state.notifications.forEach((n) => { if (!n.is_read) { n.is_read = true; count += 1; } });
    return { handled: true, data: { marked_read: count } };
  }
  if (method === 'DELETE' && (m = p.match(/^\/notifications\/([^/]+)$/))) {
    state.notifications = state.notifications.filter((n) => n.id !== m![1]);
    return { handled: true, data: undefined };
  }

  // ── Notes ──────────────────────────────────────────────────────────────
  if (method === 'GET' && (m = p.match(/^\/notes\/([^/]+)$/))) {
    return { handled: true, data: state.notes.find((n) => n.id === m![1]) ?? null };
  }
  if (method === 'GET' && p === '/notes') {
    let items = state.notes.slice();
    if (params.matter_id) items = items.filter((n) => n.matter_id === params.matter_id);
    if (params.event_id) items = items.filter((n) => n.event_id === params.event_id);
    if (params.task_id) items = items.filter((n) => n.task_id === params.task_id);
    const limit = Number(params.limit) || items.length;
    return { handled: true, data: items.slice(0, limit) };
  }
  if (method === 'POST' && p === '/notes') {
    const note: Note = {
      id: genId('note'), matter_id: (b.matter_id as string) ?? null, event_id: (b.event_id as string) ?? null,
      task_id: (b.task_id as string) ?? null, organisation_id: ORG_ID, author_id: DEMO_USER_ID, author_name: DEMO_USER_NAME,
      title: (b.title as string) ?? 'Untitled Note', body: (b.body as string) ?? null, svg_content: (b.svg_content as string) ?? null,
      note_type: b.svg_content ? 'handwritten' : 'typed', created_at: nowIso(), updated_at: nowIso(),
    };
    state.notes.unshift(note);
    return { handled: true, data: note };
  }
  if (method === 'PATCH' && (m = p.match(/^\/notes\/([^/]+)$/))) {
    const note = state.notes.find((n) => n.id === m![1]);
    if (!note) return { handled: true, data: null };
    if (typeof b.title === 'string') note.title = b.title;
    if (typeof b.body === 'string') note.body = b.body;
    if (typeof b.svg_content === 'string') note.svg_content = b.svg_content;
    if ('matter_id' in b) note.matter_id = (b.matter_id as string) ?? null;
    if ('event_id' in b) note.event_id = (b.event_id as string) ?? null;
    if ('task_id' in b) note.task_id = (b.task_id as string) ?? null;
    note.updated_at = nowIso();
    return { handled: true, data: note };
  }
  if (method === 'DELETE' && (m = p.match(/^\/notes\/([^/]+)$/))) {
    state.notes = state.notes.filter((n) => n.id !== m![1]);
    return { handled: true, data: undefined };
  }
  if (method === 'POST' && (m = p.match(/^\/notes\/([^/]+)\/add-comment$/))) {
    return { handled: true, data: state.notes.find((n) => n.id === m![1]) ?? null };
  }

  // ── Calendar ───────────────────────────────────────────────────────────
  if (method === 'GET' && p === '/calendar/events') {
    const items = state.calendarEvents.filter((e) => !params.matter_id || e.matter_id === params.matter_id);
    return { handled: true, data: { items, total: items.length } };
  }
  if (method === 'POST' && (m = p.match(/^\/calendar\/matters\/([^/]+)\/events$/))) {
    const event: CalendarEvent = {
      id: genId('cal'), matter_id: m[1], organisation_id: ORG_ID, created_by: DEMO_USER_ID,
      title: (b.title as string) ?? 'Untitled Event', description: (b.description as string) ?? null,
      event_type: (b.event_type as string) ?? 'other', location: (b.location as string) ?? null,
      starts_at: (b.starts_at as string) ?? nowIso(), ends_at: (b.ends_at as string) ?? null,
      all_day: !!b.all_day, google_event_id: null, google_event_url: null, google_sync_status: 'never_synced',
      google_synced_at: null, google_last_error: null, created_at: nowIso(), updated_at: nowIso(),
    };
    state.calendarEvents.unshift(event);
    return { handled: true, data: event };
  }
  if (method === 'PATCH' && (m = p.match(/^\/calendar\/matters\/[^/]+\/events\/([^/]+)$/))) {
    const event = state.calendarEvents.find((e) => e.id === m![1]);
    if (!event) return { handled: true, data: null };
    if (typeof b.title === 'string') event.title = b.title;
    if (typeof b.description === 'string') event.description = b.description;
    if (typeof b.event_type === 'string') event.event_type = b.event_type;
    if (typeof b.location === 'string') event.location = b.location;
    if (typeof b.starts_at === 'string') event.starts_at = b.starts_at;
    if (typeof b.ends_at === 'string') event.ends_at = b.ends_at;
    if ('all_day' in b) event.all_day = !!b.all_day;
    event.updated_at = nowIso();
    return { handled: true, data: event };
  }
  if (method === 'DELETE' && (m = p.match(/^\/calendar\/matters\/[^/]+\/events\/([^/]+)\/sync$/))) {
    const event = state.calendarEvents.find((e) => e.id === m![1]);
    if (event) { event.google_sync_status = 'never_synced'; event.google_event_id = null; event.google_synced_at = null; }
    return { handled: true, data: event ?? null };
  }
  if (method === 'DELETE' && (m = p.match(/^\/calendar\/matters\/[^/]+\/events\/([^/]+)$/))) {
    state.calendarEvents = state.calendarEvents.filter((e) => e.id !== m![1]);
    return { handled: true, data: undefined };
  }
  if (method === 'POST' && (m = p.match(/^\/calendar\/matters\/[^/]+\/events\/([^/]+)\/sync$/))) {
    const event = state.calendarEvents.find((e) => e.id === m![1]);
    if (event) { event.google_sync_status = 'synced'; event.google_event_id = genId('gcal'); event.google_synced_at = nowIso(); }
    return { handled: true, data: event ?? null };
  }

  // ── Documents ──────────────────────────────────────────────────────────
  if (method === 'GET' && (m = p.match(/^\/matters\/[^/]+\/documents\/([^/]+)\/versions$/))) {
    const doc = state.documents.find((d) => d.id === m![1]);
    return { handled: true, data: doc?.versions ?? [] };
  }
  if (method === 'POST' && (m = p.match(/^\/matters\/([^/]+)\/documents\/from-template$/))) {
    const doc = createDocument(m[1], (b.document_name as string) ?? 'Generated Document', (b.doc_type as string) ?? 'other', null, null);
    return { handled: true, data: doc };
  }
  if (method === 'POST' && (m = p.match(/^\/matters\/([^/]+)\/documents$/))) {
    const doc = createDocument(
      m[1], (b.name as string) ?? 'Untitled Document', (b.doc_type as string) ?? 'other',
      (b.drive_file_id as string) ?? null, (b.drive_url as string) ?? null, (b.label as string) ?? null
    );
    return { handled: true, data: doc };
  }
  if (method === 'POST' && (m = p.match(/^\/matters\/[^/]+\/documents\/([^/]+)\/versions$/))) {
    const doc = state.documents.find((d) => d.id === m![1]);
    if (!doc) return { handled: true, data: null };
    doc.current_version += 1;
    doc.versions.push({
      id: genId('ver'), document_id: doc.id, version_number: doc.current_version, label: (b.label as string) ?? null,
      drive_file_id: (b.drive_file_id as string) ?? '', drive_url: (b.drive_url as string) ?? '',
      notes: (b.notes as string) ?? null, uploaded_by: DEMO_USER_ID, uploaded_at: nowIso(),
    });
    doc.updated_at = nowIso();
    return { handled: true, data: doc };
  }
  if (method === 'PATCH' && (m = p.match(/^\/matters\/[^/]+\/documents\/([^/]+)\/status$/))) {
    const doc = state.documents.find((d) => d.id === m![1]);
    if (doc) { doc.status = b.status as string; doc.updated_at = nowIso(); }
    return { handled: true, data: doc ?? null };
  }
  if (method === 'DELETE' && (m = p.match(/^\/matters\/[^/]+\/documents\/([^/]+)$/))) {
    state.documents = state.documents.filter((d) => d.id !== m![1]);
    return { handled: true, data: undefined };
  }
  if (method === 'GET' && p === '/documents/templates') {
    return { handled: true, data: [] };
  }
  if (method === 'DELETE' && p.startsWith('/documents/templates/')) {
    return { handled: true, data: undefined };
  }

  // ── Reports ────────────────────────────────────────────────────────────
  if (method === 'GET' && (m = p.match(/^\/reports\/([^/]+)$/)) && p !== '/reports/history') {
    return { handled: true, data: state.reports.find((r) => r.id === m![1]) ?? null };
  }
  if (method === 'GET' && p === '/reports/history') {
    return { handled: true, data: paginate(state.reports, params) };
  }
  if (method === 'POST' && p === '/reports/generate') {
    const periodType = (b.period_type as string) ?? 'monthly';
    const now = new Date();
    const dateFrom = (b.date_from as string) ?? new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const dateTo = (b.date_to as string) ?? now.toISOString();
    const periodLabel = periodType === 'weekly' ? 'Weekly Report' : periodType === 'custom' ? 'Custom Period Report' : 'Monthly Report';
    const record: ReportRecord = {
      id: genId('report'), organisation_id: ORG_ID, title: periodLabel, period_label: periodLabel,
      date_from: dateFrom, date_to: dateTo, drive_file_id: null, drive_url: null,
      generated_at: nowIso(), created_by: DEMO_USER_ID,
    };
    state.reports.unshift(record);
    const openMatters = state.matters.filter((mm) => mm.status === 'open');
    const clientsData = state.clients.slice(0, 5).map((c) => ({
      client_id: c.id, client_name: c.name,
      matter_count: state.matters.filter((mm) => mm.client_id === c.id).length,
      matters: state.matters.filter((mm) => mm.client_id === c.id).map((mm) => ({
        matter_id: mm.id, matter_title: mm.title, reference_no: mm.reference_no, status: mm.status,
        event_count: 0, events_by_type: {},
        tasks: {
          total: state.tasks.filter((t) => t.matter_id === mm.id).length,
          completed: state.tasks.filter((t) => t.matter_id === mm.id && t.status === 'done').length,
          overdue: state.tasks.filter((t) => t.matter_id === mm.id && t.due_date && new Date(t.due_date).getTime() < Date.now() && t.status !== 'done').length,
        },
        documents: { added: state.documents.filter((d) => d.matter_id === mm.id).length, versioned: 0, signed: state.documents.filter((d) => d.matter_id === mm.id && d.status === 'signed').length },
      })),
    }));
    return {
      handled: true,
      data: {
        report: record,
        data: {
          org_id: ORG_ID, org_name: 'Adebayo, Okonkwo & Associates', period_label: periodLabel,
          date_from: dateFrom, date_to: dateTo, generated_at: nowIso(),
          total_events: mockActivities.length, matters_active: openMatters.length, matters_opened: 0, matters_closed: 0,
          clients: clientsData,
        },
      },
    };
  }

  // ── Billing — deliberately not faked; real payment flows shouldn't lie ─
  if (p === '/billing/subscription' && method === 'GET') {
    const plan = BILLING_PLAN_MAP[mockBillingInfo.plan] ?? 'free';
    return {
      handled: true,
      data: {
        plan, effective_plan: plan, plan_name: 'Pro', amount_kobo: 500000, amount_ngn: 5000,
        trial_active: false, trial_ends_at: null,
        features: { drive_integration: true, reports: true, mfa: true, advanced_tasks: true, api_access: false },
        limits: { max_matters: null, max_seats: mockBillingInfo.member_limit },
        paystack_customer_code: null, paystack_public_key: 'pk_test_demo',
      },
    };
  }
  if (p === '/billing/checkout' || p === '/billing/portal' || p === '/billing/verify') {
    return BLOCKED("Billing isn't available in the demo. Sign up for a full account to manage a subscription.");
  }

  // ── Google integration — status/disconnect are safe to fake, real OAuth isn't
  if (method === 'GET' && p === '/integrations/google/status') {
    return {
      handled: true,
      data: {
        connected: state.googleConnected, scopes: ['drive', 'calendar', 'gmail'],
        token_expiry: null, webhook_active: state.googleConnected, webhook_expires_at: null,
      },
    };
  }
  if (method === 'DELETE' && p === '/integrations/google') {
    state.googleConnected = false;
    return { handled: true, data: { message: 'Google Workspace disconnected.' } };
  }
  if (p === '/integrations/google/connect') {
    return BLOCKED("Connecting a real Google account isn't available in the demo. Sign up for a full account to use Google Workspace integration.");
  }

  return { handled: false };
}

function createDocument(
  matterId: string, name: string, docType: string,
  driveFileId: string | null, driveUrl: string | null, label: string | null = null
): Document {
  const doc: Document = {
    id: genId('doc'), matter_id: matterId, organisation_id: ORG_ID, name, doc_type: docType, status: 'draft',
    current_version: 1, drive_file_id: driveFileId, drive_url: driveUrl, added_by: DEMO_USER_ID,
    added_at: nowIso(), updated_at: nowIso(),
    versions: [{
      id: genId('ver'), document_id: '', version_number: 1, label,
      drive_file_id: driveFileId ?? '', drive_url: driveUrl ?? '', notes: null,
      uploaded_by: DEMO_USER_ID, uploaded_at: nowIso(),
    }],
  };
  doc.versions[0].document_id = doc.id;
  state.documents.unshift(doc);
  return doc;
}

/** Used by upload flows (documents.ts) that bypass apiClient via raw XHR. */
export function mockUploadDocument(matterId: string, file: File, docType: string, label: string, documentName: string): Document {
  return createDocument(matterId, documentName || file.name, docType, genId('drive-file'), '#', label || null);
}

export function mockUploadTemplate(file: File, templateName: string): { file_id: string; name: string; web_view_link: string; modified_time: string | null } {
  return { file_id: genId('template'), name: templateName || file.name, web_view_link: '#', modified_time: nowIso() };
}
