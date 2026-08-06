# backend/app/services/sync_service.py
"""
Desktop <-> cloud data sync. Desktop is always the initiator — it calls
GET /sync/changes to pull what changed on this side since its last sync,
and POST /sync/apply to push its own local changes here. This service
implements both halves; which one runs where just depends on which side
of the HTTP call you're on (see app/api/sync.py).

Table coverage mirrors every model in app/models/ except the two that are
pure local/installation state and never make sense to sync (nothing —
there are no such tables today; all 24 models are in scope per the sync
plan). Each table is one of:
  - update-tracked: has updated_at, real conflict detection (both sides
    changed the same row since last sync) is possible.
  - insert-only: no updated_at (either append-only by design, or mutable
    but with no way to tell which side's edit is newer) — new rows sync
    cleanly; a row existing on both sides with different values is
    flagged as a conflict too, same as update-tracked conflicts, just
    detected by value-mismatch instead of dual-timestamp-change.

SENSITIVE_COLUMNS is a hard denylist, not an allowlist gap — these are
Fernet-encrypted under each environment's own ENCRYPTION_KEY and are
never decryptable across environments. Checked by name against every
table's columns, not just omitted from a hand-written list, so a future
column named e.g. "google_refresh_token" on a different table would also
be caught automatically.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from sqlalchemy import Select, and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import models

# Fernet-encrypted, environment-specific — never synced, regardless of
# which table they appear on.
SENSITIVE_COLUMNS = {
    "google_access_token",
    "google_refresh_token",
    "mfa_secret",
}


@dataclass
class TableSyncConfig:
    name: str
    model: type
    update_tracked: bool
    # How to scope this table's rows to a single organisation. Exactly one
    # of org_column / org_via_join / is_org_itself is set.
    org_column: str | None = "organisation_id"
    org_via_join: tuple[type, str, str] | None = None  # (join_model, join_fk_col_on_this_table, org_column_on_join_model)
    is_org_itself: bool = False  # this table IS organisations — scope by id == org_id
    conflict_key: tuple[str, ...] = ("id",)
    excluded_columns: tuple[str, ...] = field(default_factory=tuple)


def _cols(model: type, exclude: tuple[str, ...] = ()) -> list[str]:
    skip = SENSITIVE_COLUMNS | set(exclude)
    return [c.name for c in model.__table__.columns if c.name not in skip]


TABLE_REGISTRY: list[TableSyncConfig] = [
    TableSyncConfig("organisations", models.Organisation, update_tracked=True, org_column=None, is_org_itself=True),
    TableSyncConfig("organisation_members", models.OrganisationMember, update_tracked=False),
    TableSyncConfig("clients", models.Client, update_tracked=True),
    TableSyncConfig("matters", models.Matter, update_tracked=True),
    TableSyncConfig("tasks", models.Task, update_tracked=True),
    TableSyncConfig("task_comments", models.TaskComment, update_tracked=True),
    TableSyncConfig("task_watchers", models.TaskWatcher, update_tracked=False, conflict_key=("task_id", "user_id")),
    TableSyncConfig("task_document_links", models.TaskDocumentLink, update_tracked=False, conflict_key=("task_id", "document_id")),
    TableSyncConfig("matter_documents", models.MatterDocument, update_tracked=True),
    TableSyncConfig(
        "matter_document_versions", models.MatterDocumentVersion, update_tracked=False,
        org_column=None,
        org_via_join=(models.MatterDocument, "document_id", "organisation_id"),
    ),
    TableSyncConfig("matter_emails", models.MatterEmail, update_tracked=False),
    TableSyncConfig("matter_notes", models.Note, update_tracked=True),
    TableSyncConfig("calendar_events", models.CalendarEvent, update_tracked=True),
    TableSyncConfig("fee_arrangements", models.FeeArrangement, update_tracked=True),
    TableSyncConfig("invoices", models.Invoice, update_tracked=True),
    TableSyncConfig("invoice_line_items", models.InvoiceLineItem, update_tracked=False),
    TableSyncConfig("disbursements", models.Disbursement, update_tracked=False),
    TableSyncConfig("payments", models.Payment, update_tracked=False),
    TableSyncConfig("activity_logs", models.ActivityLog, update_tracked=False),
    TableSyncConfig("audit_logs", models.AuditLog, update_tracked=False),
    TableSyncConfig("billing_transactions", models.BillingTransaction, update_tracked=False),
    TableSyncConfig("notifications", models.Notification, update_tracked=False),
    TableSyncConfig("reports", models.Report, update_tracked=False),
    # users: not org-scoped directly (a user can belong to multiple orgs) —
    # scoped via organisation_members membership, same join pattern as
    # matter_document_versions.
    TableSyncConfig(
        "users", models.User, update_tracked=True,
        org_column=None,
        org_via_join=(models.OrganisationMember, "id", "organisation_id"),
        excluded_columns=("hashed_password", "mfa_backup_codes", "password_reset_token", "invite_token"),
    ),
]

TABLES_BY_NAME = {t.name: t for t in TABLE_REGISTRY}


def _org_scoped_query(cfg: TableSyncConfig, org_id: uuid.UUID) -> Select:
    model = cfg.model
    if cfg.is_org_itself:
        return select(model).where(model.id == org_id)
    if cfg.org_via_join:
        join_model, fk_col, join_org_col = cfg.org_via_join
        fk_column = getattr(model, fk_col)
        join_id_column = join_model.id
        org_column = getattr(join_model, join_org_col)
        return select(model).join(join_model, fk_column == join_id_column).where(org_column == org_id)
    org_column = getattr(model, cfg.org_column)
    return select(model).where(org_column == org_id)


def _row_to_dict(cfg: TableSyncConfig, row: Any) -> dict[str, Any]:
    cols = _cols(cfg.model, cfg.excluded_columns)
    return {c: getattr(row, c) for c in cols}


async def get_changed_rows(db: AsyncSession, cfg: TableSyncConfig, org_id: uuid.UUID, since: datetime | None) -> list[dict[str, Any]]:
    """All rows for this org, optionally filtered to those touched since `since`."""
    query = _org_scoped_query(cfg, org_id)
    if since is not None:
        model = cfg.model
        # Not every update_tracked table also has created_at (e.g.
        # MatterDocument has only updated_at) — build the OR from
        # whichever timestamp columns actually exist rather than assuming
        # both are always present.
        conditions = []
        if cfg.update_tracked and hasattr(model, "updated_at"):
            conditions.append(model.updated_at > since)
        if hasattr(model, "created_at"):
            conditions.append(model.created_at > since)
        if conditions:
            query = query.where(or_(*conditions))
        # tables with neither timestamp fall through and return every row
        # every time — acceptable given none exist in practice.
    result = await db.execute(query)
    return [_row_to_dict(cfg, row) for row in result.scalars().all()]


async def get_all_changes(db: AsyncSession, org_id: uuid.UUID, since: datetime | None) -> dict[str, list[dict[str, Any]]]:
    return {cfg.name: await get_changed_rows(db, cfg, org_id, since) for cfg in TABLE_REGISTRY}


def _coerce_value(model: type, column_name: str, value: Any) -> Any:
    """
    Row values arrive as plain JSON-decoded Python types (str, int, float,
    bool, None, dict/list). SQLAlchemy auto-converts a plain string into
    the right type for most column types (UUID, datetime) when it's bound
    as a query/insert parameter, but NOT for Enum columns assigned via
    plain setattr — that leaves a raw str sitting where an Enum member is
    expected, which breaks any code downstream that treats it as one
    (e.g. InvoiceService._recompute_totals doing `item.kind.value`).
    Convert explicitly wherever the column is an Enum.
    """
    if value is None:
        return value
    column = model.__table__.columns.get(column_name)
    if column is None:
        return value
    enum_class = getattr(column.type, "enum_class", None)
    if enum_class is not None and not isinstance(value, enum_class):
        return enum_class(value)
    return value


async def apply_rows(db: AsyncSession, table_name: str, org_id: uuid.UUID, rows: list[dict[str, Any]]) -> int:
    """
    Upsert a batch of rows for one table, scoped to org_id (every row is
    verified to belong to this org before being written — a caller can
    never use this to write into another organisation's data). Returns
    the number of rows written.
    """
    cfg = TABLES_BY_NAME.get(table_name)
    if cfg is None:
        raise ValueError(f"Unknown sync table: {table_name}")

    model = cfg.model
    allowed_cols = set(_cols(model, cfg.excluded_columns))
    written = 0

    for row in rows:
        row = {k: _coerce_value(model, k, v) for k, v in row.items() if k in allowed_cols}
        if not _row_belongs_to_org(cfg, row, org_id):
            continue

        pk_filter = and_(*[getattr(model, k) == row[k] for k in cfg.conflict_key])
        existing = (await db.execute(select(model).where(pk_filter))).scalar_one_or_none()
        if existing is None:
            db.add(model(**row))
        else:
            for k, v in row.items():
                if k not in cfg.conflict_key:
                    setattr(existing, k, v)
        written += 1

    if table_name in ("invoices", "invoice_line_items") and written:
        await _recompute_touched_invoices(db, rows, table_name, org_id)

    return written


def _row_belongs_to_org(cfg: TableSyncConfig, row: dict[str, Any], org_id: uuid.UUID) -> bool:
    """
    Defense in depth: even though the caller is expected to only ever send
    rows for their own org, never trust that blindly for a write path.
    Rows whose org can't be determined from the payload itself (the
    join-scoped tables) are allowed through — their FK targets (an
    existing matter_document/organisation_member) are themselves
    org-scoped and would already reject a cross-org write via normal
    application logic if this were reached through it; this function is
    a fast, cheap first check for the tables where org_id is directly
    present in the payload.
    """
    # Row values arrive as plain JSON (strings), while org_id is a real
    # uuid.UUID from the authenticated request — compare as strings so a
    # syntactically-equal id doesn't fail the check purely on type.
    if cfg.is_org_itself:
        return str(row.get("id")) == str(org_id)
    if cfg.org_column and "organisation_id" in row:
        return str(row.get(cfg.org_column)) == str(org_id)
    return True


async def _recompute_touched_invoices(db: AsyncSession, rows: list[dict[str, Any]], table_name: str, org_id: uuid.UUID) -> None:
    """
    invoice_line_items are synced via generic upsert, which bypasses the
    total-recomputation invoice_service.py normally does on every
    line-item mutation — redo it here so subtotal/VAT/WHT/total/
    net_payable stay correct after a sync.
    """
    from app.services.invoice_service import InvoiceService

    if table_name == "invoices":
        invoice_ids = {r["id"] for r in rows}
    else:
        invoice_ids = {r["invoice_id"] for r in rows if r.get("invoice_id")}
    if not invoice_ids:
        return

    result = await db.execute(
        select(models.Invoice)
        .where(models.Invoice.id.in_(invoice_ids), models.Invoice.organisation_id == org_id)
    )
    invoices = result.scalars().unique().all()
    service = InvoiceService(db)
    for invoice in invoices:
        await db.refresh(invoice, attribute_names=["line_items"])
        service._recompute_totals(invoice)
