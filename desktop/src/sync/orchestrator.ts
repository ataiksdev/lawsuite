import { loadOrCreateRuntimeConfig, writeRuntimeConfig } from "../bootstrap/secrets";
import { logBootstrap } from "../bootstrap/logger";
import { ports } from "../bootstrap/ports";
import { getCloudAccessToken } from "./connect";

type Row = Record<string, unknown>;
type TableChanges = Record<string, Row[]>;

interface ChangesResponse {
  server_time: string;
  tables: TableChanges;
}

export interface SyncConflict {
  table: string;
  id: string;
  label: string;
  localUpdatedAt: string | null;
  cloudUpdatedAt: string | null;
}

export type SyncResult =
  | { status: "no_changes" }
  | { status: "synced"; pushed: number; pulled: number }
  | { status: "conflicts"; conflicts: SyncConflict[] }
  | { status: "error"; message: string };

// Mirrors backend/app/services/sync_service.py's TABLE_REGISTRY just
// enough to drive conflict detection here — the actual row data, org
// scoping, and sensitive-field exclusion all come from the backend (both
// copies of it, local and cloud) via the two /sync endpoints. This is
// metadata about SHAPE, not a second implementation of the sync logic
// itself.
const UPDATE_TRACKED_TABLES = new Set([
  "organisations", "users", "clients", "matters", "tasks", "task_comments",
  "matter_documents", "matter_notes", "calendar_events", "fee_arrangements", "invoices",
]);
const COMPOSITE_KEYS: Record<string, string[]> = {
  task_watchers: ["task_id", "user_id"],
  task_document_links: ["task_id", "document_id"],
};
const LABEL_FIELDS = ["name", "title", "description", "full_name", "email"];

function rowKey(table: string, row: Row): string {
  const keyCols = COMPOSITE_KEYS[table] ?? ["id"];
  return keyCols.map((c) => String(row[c])).join("::");
}

function rowLabel(row: Row): string {
  for (const field of LABEL_FIELDS) {
    if (typeof row[field] === "string" && row[field]) return row[field] as string;
  }
  return String(row.id ?? "record");
}

async function fetchChanges(baseUrl: string, accessToken: string, since: string | null): Promise<ChangesResponse> {
  const url = new URL(`${baseUrl}/sync/changes`);
  if (since) url.searchParams.set("since", since);
  const resp = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!resp.ok) throw new Error(`Failed to fetch changes from ${baseUrl} (${resp.status})`);
  return (await resp.json()) as ChangesResponse;
}

async function applyChanges(baseUrl: string, accessToken: string, tables: TableChanges): Promise<number> {
  if (Object.keys(tables).length === 0) return 0;
  const resp = await fetch(`${baseUrl}/sync/apply`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ tables }),
  });
  if (!resp.ok) throw new Error(`Failed to apply changes to ${baseUrl} (${resp.status})`);
  const body = (await resp.json()) as { written: Record<string, number> };
  return Object.values(body.written).reduce((a, b) => a + b, 0);
}

function isNewer(a: Row, b: Row): boolean {
  const aTime = (a.updated_at as string) ?? (a.created_at as string) ?? "";
  const bTime = (b.updated_at as string) ?? (b.created_at as string) ?? "";
  return aTime > bTime;
}

export async function runSync(localAccessToken: string, options: { forceThroughConflicts?: boolean } = {}): Promise<SyncResult> {
  const cloud = await getCloudAccessToken();
  if (!cloud) {
    return { status: "error", message: "Not connected to a cloud account — use Connect to Cloud first." };
  }

  const { config } = await loadOrCreateRuntimeConfig();
  const since = config.lastSyncedAt ?? null;
  const localUrl = `http://127.0.0.1:${ports.backend}`;

  logBootstrap(`sync: fetching changes since ${since ?? "(first sync)"}`);
  const [localChanges, cloudChanges] = await Promise.all([
    fetchChanges(localUrl, localAccessToken, since),
    fetchChanges(cloud.cloudUrl, cloud.accessToken, since),
  ]);

  const conflicts: SyncConflict[] = [];
  const pushToCloud: TableChanges = {};
  const pullToLocal: TableChanges = {};

  const allTables = new Set([...Object.keys(localChanges.tables), ...Object.keys(cloudChanges.tables)]);

  for (const table of allTables) {
    const localRows = localChanges.tables[table] ?? [];
    const cloudRows = cloudChanges.tables[table] ?? [];
    const localByKey = new Map(localRows.map((r) => [rowKey(table, r), r]));
    const cloudByKey = new Map(cloudRows.map((r) => [rowKey(table, r), r]));

    for (const [key, localRow] of localByKey) {
      const cloudRow = cloudByKey.get(key);
      if (!cloudRow) {
        // changed locally only -> push
        (pushToCloud[table] ??= []).push(localRow);
        continue;
      }
      // changed on both sides since last sync
      const isConflict = UPDATE_TRACKED_TABLES.has(table)
        ? true // both sides independently touched this row's updated_at since `since`
        : JSON.stringify(localRow) !== JSON.stringify(cloudRow); // no timestamp — only a real conflict if values actually differ

      if (!isConflict) continue;

      if (!options.forceThroughConflicts) {
        conflicts.push({
          table,
          id: String(localRow.id ?? key),
          label: rowLabel(localRow),
          localUpdatedAt: (localRow.updated_at as string) ?? (localRow.created_at as string) ?? null,
          cloudUpdatedAt: (cloudRow.updated_at as string) ?? (cloudRow.created_at as string) ?? null,
        });
      } else if (UPDATE_TRACKED_TABLES.has(table) && isNewer(localRow, cloudRow)) {
        (pushToCloud[table] ??= []).push(localRow);
      } else {
        // cloud wins: either it's genuinely newer, or there's no
        // timestamp to compare (the documented no-timestamp-table
        // fallback) — pull cloud's version to local either way.
        (pullToLocal[table] ??= []).push(cloudRow);
      }
    }

    for (const [key, cloudRow] of cloudByKey) {
      if (!localByKey.has(key)) {
        (pullToLocal[table] ??= []).push(cloudRow);
      }
    }
  }

  if (conflicts.length > 0 && !options.forceThroughConflicts) {
    logBootstrap(`sync: ${conflicts.length} conflict(s) found, awaiting user decision`);
    return { status: "conflicts", conflicts };
  }

  const pushedCount = Object.values(pushToCloud).reduce((a, r) => a + r.length, 0);
  const pulledCount = Object.values(pullToLocal).reduce((a, r) => a + r.length, 0);

  if (pushedCount === 0 && pulledCount === 0) {
    writeRuntimeConfig({ ...config, lastSyncedAt: localChanges.server_time });
    return { status: "no_changes" };
  }

  await Promise.all([
    applyChanges(cloud.cloudUrl, cloud.accessToken, pushToCloud),
    applyChanges(localUrl, localAccessToken, pullToLocal),
  ]);

  // Use the earlier of the two servers' clocks as the new cursor — safer
  // than the later one, which could skip a change that landed on the
  // slower side between the two /sync/changes calls above.
  const newCursor = localChanges.server_time < cloudChanges.server_time ? localChanges.server_time : cloudChanges.server_time;
  writeRuntimeConfig({ ...config, lastSyncedAt: newCursor });
  logBootstrap(`sync: complete — pushed ${pushedCount}, pulled ${pulledCount}`);

  return { status: "synced", pushed: pushedCount, pulled: pulledCount };
}
