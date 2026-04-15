# backend/app/services/calendar_service.py
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.calendar_event import CalendarEvent, CalendarSyncStatus
from app.models.matter import Matter
from app.models.user import User
from app.schemas.calendar import CalendarEventCreate, CalendarEventUpdate
from app.services.activity_service import ActivityService
from app.services.google_calendar_service import GoogleCalendarService
from app.services.notification_service import NotificationService


class CalendarService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.activity = ActivityService(db)
        self.notifications = NotificationService(db)

    # ── Helpers ───────────────────────────────────────────────────────────

    async def _get_matter(self, matter_id: uuid.UUID, org_id: uuid.UUID) -> Matter:
        result = await self.db.execute(
            select(Matter).where(Matter.id == matter_id, Matter.organisation_id == org_id)
        )
        matter = result.scalar_one_or_none()
        if not matter:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Matter not found")
        return matter

    async def _get_event(self, event_id: uuid.UUID, matter_id: uuid.UUID, org_id: uuid.UUID) -> CalendarEvent:
        result = await self.db.execute(
            select(CalendarEvent).where(
                CalendarEvent.id == event_id,
                CalendarEvent.matter_id == matter_id,
                CalendarEvent.organisation_id == org_id,
            )
        )
        event = result.scalar_one_or_none()
        if not event:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Calendar event not found")
        return event

    async def _get_author_name(self, user_id: uuid.UUID) -> str:
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        return user.full_name if user else "Unknown"

    # ── Events ────────────────────────────────────────────────────────────

    async def list_events(
        self,
        org_id: uuid.UUID,
        starts_from: datetime | None = None,
        ends_before: datetime | None = None,
        matter_id: uuid.UUID | None = None,
    ) -> list[CalendarEvent]:
        query = select(CalendarEvent).where(CalendarEvent.organisation_id == org_id)
        if matter_id:
            query = query.where(CalendarEvent.matter_id == matter_id)
        if starts_from:
            query = query.where(CalendarEvent.starts_at >= starts_from)
        if ends_before:
            query = query.where(CalendarEvent.starts_at <= ends_before)
        result = await self.db.execute(query.order_by(CalendarEvent.starts_at.asc()))
        return list(result.scalars().all())

    async def create_event(
        self,
        matter_id: uuid.UUID,
        org_id: uuid.UUID,
        user_id: uuid.UUID,
        data: CalendarEventCreate,
    ) -> CalendarEvent:
        await self._get_matter(matter_id, org_id)
        event = CalendarEvent(
            matter_id=matter_id,
            organisation_id=org_id,
            created_by=user_id,
            title=data.title.strip(),
            description=data.description.strip() if data.description else None,
            event_type=data.event_type,
            location=data.location.strip() if data.location else None,
            starts_at=data.starts_at,
            ends_at=data.ends_at,
            all_day=data.all_day,
        )
        self.db.add(event)
        await self.db.flush()

        await self.activity.log(
            matter_id=matter_id,
            org_id=org_id,
            actor_id=user_id,
            event_type="calendar_event_created",
            payload={
                "event_id": str(event.id),
                "title": event.title,
                "event_type": event.event_type.value,
            },
        )

        # Notify the matter's assigned lawyer if they didn't create the event
        matter = await self._get_matter(matter_id, org_id)
        if matter.assigned_to and matter.assigned_to != user_id:
            starts = event.starts_at.strftime("%d %b %Y, %H:%M") if event.starts_at else ""
            await self.notifications.create(
                user_id=matter.assigned_to,
                org_id=org_id,
                type="info",
                title=f'New calendar event: "{event.title}"',
                message=f"Added to matter — {starts}" if starts else "Added to your matter.",
                link="/calendar",
            )

        await self.db.commit()
        await self.db.refresh(event)
        return event

    async def update_event(
        self,
        event_id: uuid.UUID,
        matter_id: uuid.UUID,
        org_id: uuid.UUID,
        user_id: uuid.UUID,
        data: CalendarEventUpdate,
    ) -> CalendarEvent:
        event = await self._get_event(event_id, matter_id, org_id)
        update_data = data.model_dump(exclude_unset=True)

        merged_starts = update_data.get("starts_at", event.starts_at)
        merged_ends = update_data.get("ends_at", event.ends_at)
        if merged_ends and merged_starts and merged_ends < merged_starts:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="ends_at must be after starts_at",
            )

        for field, value in update_data.items():
            if isinstance(value, str):
                value = value.strip() or None
            setattr(event, field, value)

        if event.google_event_id:
            event.google_sync_status = CalendarSyncStatus.never_synced
            event.google_last_error = None

        await self.activity.log(
            matter_id=matter_id,
            org_id=org_id,
            actor_id=user_id,
            event_type="calendar_event_updated",
            payload={"event_id": str(event.id), "title": event.title},
        )

        await self.db.commit()
        await self.db.refresh(event)
        return event

    async def delete_event(
        self,
        event_id: uuid.UUID,
        matter_id: uuid.UUID,
        org_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> None:
        event = await self._get_event(event_id, matter_id, org_id)
        await self.activity.log(
            matter_id=matter_id,
            org_id=org_id,
            actor_id=user_id,
            event_type="calendar_event_deleted",
            payload={"event_id": str(event.id), "title": event.title},
        )
        await self.db.delete(event)
        await self.db.commit()

    async def sync_event_to_google(
        self,
        event_id: uuid.UUID,
        matter_id: uuid.UUID,
        org_id: uuid.UUID,
        user_id: uuid.UUID,
        google_service: GoogleCalendarService,
    ) -> CalendarEvent:
        matter = await self._get_matter(matter_id, org_id)
        event = await self._get_event(event_id, matter_id, org_id)
        try:
            pushed = await google_service.push_event(event, matter)
            event.google_event_id = pushed["id"]
            event.google_event_url = pushed.get("htmlLink")
            event.google_sync_status = CalendarSyncStatus.synced
            event.google_synced_at = datetime.now(timezone.utc)
            event.google_last_error = None
        except HTTPException as exc:
            event.google_sync_status = CalendarSyncStatus.sync_error
            event.google_last_error = exc.detail
            await self.db.commit()
            raise

        await self.activity.log(
            matter_id=matter_id,
            org_id=org_id,
            actor_id=user_id,
            event_type="calendar_event_synced",
            payload={
                "event_id": str(event.id),
                "title": event.title,
                "google_event_id": event.google_event_id,
            },
        )
        await self.db.commit()
        await self.db.refresh(event)
        return event

    async def unlink_event_from_google(
        self,
        event_id: uuid.UUID,
        matter_id: uuid.UUID,
        org_id: uuid.UUID,
        user_id: uuid.UUID,
        google_service: GoogleCalendarService,
    ) -> CalendarEvent:
        event = await self._get_event(event_id, matter_id, org_id)
        if event.google_event_id:
            await google_service.delete_remote_event(event.google_event_id)
        event.google_event_id = None
        event.google_event_url = None
        event.google_sync_status = CalendarSyncStatus.never_synced
        event.google_synced_at = None
        event.google_last_error = None

        await self.activity.log(
            matter_id=matter_id,
            org_id=org_id,
            actor_id=user_id,
            event_type="calendar_event_unsynced",
            payload={"event_id": str(event.id), "title": event.title},
        )
        await self.db.commit()
        await self.db.refresh(event)
        return event
