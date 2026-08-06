# backend/app/api/sync.py
"""
Desktop <-> cloud sync endpoints. Admin-only, org-scoped. The cloud side
of these is what a desktop install's sync orchestrator calls into — the
cloud app itself never calls these against anything (sync is always
desktop-initiated, see desktop/src/sync/orchestrator.ts).
"""
from datetime import datetime

from fastapi import APIRouter

from app.core.deps import AdminUser, ScopedDB
from app.schemas.sync import SyncApplyRequest, SyncApplyResponse, SyncChangesResponse
from app.services.sync_service import apply_rows, get_all_changes

router = APIRouter()


@router.get("/changes", response_model=SyncChangesResponse)
async def get_changes(current_user: AdminUser, db: ScopedDB, since: datetime | None = None):
    """
    Everything that changed for this org since `since` (or everything, if
    omitted — used for a brand-new desktop install's first sync). Returns
    the server's own clock alongside the data so the caller advances its
    "last synced at" using the server's time, not its own — avoids any
    issue from the two machines' clocks disagreeing.
    """
    tables = await get_all_changes(db, current_user.org_id, since)
    # Naive UTC, matching the app-wide convention every model uses for
    # created_at/updated_at (datetime.utcnow(), not timezone-aware) — a
    # timezone-aware value here would compare incorrectly against those
    # columns once Postgres applies its own session-timezone handling.
    return SyncChangesResponse(server_time=datetime.utcnow(), tables=tables)


@router.post("/apply", response_model=SyncApplyResponse)
async def apply_changes(payload: SyncApplyRequest, current_user: AdminUser, db: ScopedDB):
    """Upsert a batch of rows pushed from the caller's side, scoped to the caller's own org."""
    written = {}
    for table_name, rows in payload.tables.items():
        written[table_name] = await apply_rows(db, table_name, current_user.org_id, rows)
    await db.commit()
    return SyncApplyResponse(written=written)
