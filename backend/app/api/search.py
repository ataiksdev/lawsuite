# backend/app/api/search.py
"""
Global search — GET /search?q=...

Searches across matters, clients, notes, and tasks in one shot.
Returns up to 5 results per category. The query must be at least 2 chars.
"""
import uuid
from typing import Literal

from fastapi import APIRouter, Query, HTTPException
from sqlalchemy import or_, select
from sqlalchemy.orm import selectinload

from app.core.deps import DB, AuthUser
from app.models.client import Client
from app.models.matter import Matter
from app.models.note import Note
from app.models.task import Task, TaskStatus

router = APIRouter()

ResultKind = Literal["matter", "client", "note", "task"]


def _matter_url(matter_id: str) -> str:
    return f"/matters/{matter_id}"


def _client_url(client_id: str) -> str:
    return f"/clients/{client_id}"


@router.get("")
async def global_search(
    q: str = Query(..., min_length=2, max_length=200),
    current_user: AuthUser = None,
    db: DB = None,
):
    """
    Search matters, clients, notes, and tasks for the authenticated org.
    Returns at most 5 hits per category. Minimum query length is 2 chars.
    """
    org_id: uuid.UUID = current_user.org_id
    term = f"%{q.strip()}%"
    results: list[dict] = []

    # ── Matters ───────────────────────────────────────────────────────────
    matter_rows = (
        await db.execute(
            select(Matter)
            .options(selectinload(Matter.client))
            .where(
                Matter.organisation_id == org_id,
                or_(
                    Matter.title.ilike(term),
                    Matter.reference_no.ilike(term),
                    Matter.description.ilike(term),
                ),
            )
            .limit(5)
        )
    ).scalars().all()

    for m in matter_rows:
        results.append({
            "kind": "matter",
            "id": str(m.id),
            "title": m.title,
            "subtitle": f"{m.reference_no} · {m.client.name if m.client else ''}",
            "url": _matter_url(str(m.id)),
            "status": m.status.value,
        })

    # ── Clients ───────────────────────────────────────────────────────────
    client_rows = (
        await db.execute(
            select(Client).where(
                Client.organisation_id == org_id,
                or_(
                    Client.name.ilike(term),
                    Client.email.ilike(term),
                ),
            )
            .limit(5)
        )
    ).scalars().all()

    for c in client_rows:
        results.append({
            "kind": "client",
            "id": str(c.id),
            "title": c.name,
            "subtitle": c.email or "",
            "url": _client_url(str(c.id)),
            "status": "active" if c.is_active else "archived",
        })

    # ── Notes ─────────────────────────────────────────────────────────────
    note_rows = (
        await db.execute(
            select(Note).where(
                Note.organisation_id == org_id,
                or_(
                    Note.title.ilike(term),
                    Note.body.ilike(term),
                ),
            )
            .order_by(Note.updated_at.desc())
            .limit(5)
        )
    ).scalars().all()

    for n in note_rows:
        results.append({
            "kind": "note",
            "id": str(n.id),
            "title": n.title,
            "subtitle": (n.body or "")[:80].replace("\n", " "),
            "url": "/notes",
            "note_id": str(n.id),
            "status": n.note_type.value,
        })

    # ── Tasks ─────────────────────────────────────────────────────────────
    task_rows = (
        await db.execute(
            select(Task).where(
                Task.organisation_id == org_id,
                Task.is_deleted == False,
                Task.status.notin_([TaskStatus.cancelled]),
                or_(
                    Task.title.ilike(term),
                    Task.notes.ilike(term),
                ),
            )
            .limit(5)
        )
    ).scalars().all()

    for t in task_rows:
        results.append({
            "kind": "task",
            "id": str(t.id),
            "title": t.title,
            "subtitle": t.priority or "",
            "url": _matter_url(str(t.matter_id)),
            "status": t.status.value,
        })

    return {"query": q, "results": results}
