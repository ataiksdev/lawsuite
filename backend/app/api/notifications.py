# backend/app/api/notifications.py
"""
Notifications API

Endpoints:
  GET  /notifications              — paginated list (newest first)
  GET  /notifications/stream       — SSE stream: pushes events to the browser
  PATCH /notifications/{id}/read   — mark one notification read
  POST  /notifications/read-all    — mark all read
  DELETE /notifications/{id}       — delete one notification

SSE stream format:
  Each event is either:
    event: ping       — heartbeat every 20s (keeps connection alive)
    event: unread     — sent when unread count changes; data: {"count": N}
    event: notification — sent immediately when a new notification arrives;
                          data: <serialised Notification JSON>

The stream uses long-polling fallback compatible with EventSource.
"""
import asyncio
import json
import uuid
from datetime import datetime
from typing import AsyncGenerator

from fastapi import APIRouter, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from app.core.deps import DB, AuthUser
from app.models.notification import Notification
from app.services.notification_service import NotificationService

router = APIRouter()

# ─── SSE helper ───────────────────────────────────────────────────────────────


def _serialize_notification(n: Notification) -> str:
    """Serialise a Notification row to a JSON string for SSE."""
    return json.dumps(
        {
            "id": str(n.id),
            "type": n.type,
            "title": n.title,
            "message": n.message,
            "link": n.link,
            "is_read": n.is_read,
            "created_at": n.created_at.isoformat(),
        }
    )


async def _sse_event(event: str, data: str) -> str:
    return f"event: {event}\ndata: {data}\n\n"


# ─── List ─────────────────────────────────────────────────────────────────────


@router.get("", response_model=list[dict])
async def list_notifications(
    current_user: AuthUser,
    db: DB,
    unread_only: bool = Query(False),
    limit: int = Query(50, ge=1, le=100),
):
    """List notifications for the authenticated user, newest first."""
    service = NotificationService(db)
    notifications = await service.list_for_user(
        user_id=current_user.user_id,
        org_id=current_user.org_id,
        unread_only=unread_only,
        limit=limit,
    )
    return [
        {
            "id": str(n.id),
            "type": n.type,
            "title": n.title,
            "message": n.message,
            "link": n.link,
            "is_read": n.is_read,
            "created_at": n.created_at.isoformat(),
        }
        for n in notifications
    ]


@router.get("/unread-count", response_model=dict)
async def unread_count(current_user: AuthUser, db: DB):
    """Return the count of unread notifications for the current user."""
    service = NotificationService(db)
    count = await service.unread_count(current_user.user_id, current_user.org_id)
    return {"count": count}


# ─── SSE stream ───────────────────────────────────────────────────────────────


@router.get("/stream")
async def notification_stream(current_user: AuthUser, db: DB):
    """
    Server-Sent Events stream for real-time notification delivery.

    The browser connects once; the server keeps the connection open and pushes:
      - A `ping` heartbeat every 20 seconds (prevents proxy timeouts)
      - An `unread` event whenever the unread count changes
      - A `notification` event immediately when a new notification is created

    The client should reconnect automatically (EventSource does this natively).
    """
    user_id = current_user.user_id
    org_id = current_user.org_id

    async def event_generator() -> AsyncGenerator[str, None]:
        from app.core.database import AsyncSessionLocal

        last_seen_id: uuid.UUID | None = None
        last_count: int = -1

        # Bootstrap: send current unread count immediately on connect
        async with AsyncSessionLocal() as session:
            svc = NotificationService(session)
            count = await svc.unread_count(user_id, org_id)
            last_count = count
            yield await _sse_event("unread", json.dumps({"count": count}))

            # Also send the 5 most recent unread notifications on connect
            recent = await svc.list_for_user(user_id, org_id, unread_only=True, limit=5)
            for n in recent:
                yield await _sse_event("notification", _serialize_notification(n))
                last_seen_id = n.id

        tick = 0
        while True:
            try:
                await asyncio.sleep(5)
                tick += 1

                async with AsyncSessionLocal() as session:
                    svc = NotificationService(session)

                    # Check for new notifications since last seen
                    query = (
                        select(Notification)
                        .where(
                            Notification.user_id == user_id,
                            Notification.organisation_id == org_id,
                            Notification.is_read == False,
                        )
                        .order_by(Notification.created_at.desc())
                        .limit(10)
                    )
                    result = await session.execute(query)
                    new_notifs = result.scalars().all()

                    # Push notifications that are newer than last_seen_id
                    pushed = False
                    for n in reversed(new_notifs):  # oldest first
                        if last_seen_id is None or n.created_at > (
                            await _get_notif_time(session, last_seen_id)
                        ):
                            yield await _sse_event("notification", _serialize_notification(n))
                            last_seen_id = n.id
                            pushed = True

                    # Push updated unread count if changed
                    count = await svc.unread_count(user_id, org_id)
                    if count != last_count or pushed:
                        last_count = count
                        yield await _sse_event("unread", json.dumps({"count": count}))

                # Heartbeat every ~20s (tick * 5s = 20s at tick==4)
                if tick % 4 == 0:
                    yield await _sse_event("ping", "{}")

            except asyncio.CancelledError:
                break
            except Exception:
                # Don't let a DB error crash the stream; just keep going
                await asyncio.sleep(5)

    async def _get_notif_time(session, notif_id: uuid.UUID) -> datetime:
        """Helper: fetch created_at of the last-seen notification."""
        if notif_id is None:
            from datetime import timezone
            return datetime.min.replace(tzinfo=timezone.utc)
        result = await session.execute(
            select(Notification.created_at).where(Notification.id == notif_id)
        )
        row = result.scalar_one_or_none()
        from datetime import timezone
        return row or datetime.min.replace(tzinfo=timezone.utc)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",   # prevents Nginx buffering the stream
        },
    )


# ─── Mark read ────────────────────────────────────────────────────────────────


@router.patch("/{notification_id}/read", response_model=dict)
async def mark_read(
    notification_id: uuid.UUID,
    current_user: AuthUser,
    db: DB,
):
    """Mark a single notification as read."""
    service = NotificationService(db)
    notif = await service.mark_read(
        notification_id=notification_id,
        user_id=current_user.user_id,
        org_id=current_user.org_id,
    )
    if not notif:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"id": str(notif.id), "is_read": notif.is_read}


@router.post("/read-all", response_model=dict)
async def mark_all_read(current_user: AuthUser, db: DB):
    """Mark all unread notifications for the current user as read."""
    service = NotificationService(db)
    count = await service.mark_all_read(
        user_id=current_user.user_id,
        org_id=current_user.org_id,
    )
    return {"marked_read": count}


# ─── Delete ───────────────────────────────────────────────────────────────────


@router.delete("/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_notification(
    notification_id: uuid.UUID,
    current_user: AuthUser,
    db: DB,
):
    """Delete a notification."""
    from sqlalchemy import delete
    await db.execute(
        delete(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == current_user.user_id,
            Notification.organisation_id == current_user.org_id,
        )
    )
    await db.commit()
