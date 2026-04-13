import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.calendar_event import CalendarEvent, CalendarSyncStatus
from app.models.matter import Matter
from app.models import MatterNote, MatterNoteType
from app.models.task_comment import TaskComment
from app.models.user import User
from app.schemas.calendar import CalendarEventCreate, CalendarEventUpdate, MatterNoteCreate, MatterNoteUpdate
from app.services.activity_service import ActivityService
from app.services.google_calendar_service import GoogleCalendarService


class CalendarService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.activity = ActivityService(db)

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

    async def _get_note(self, note_id: uuid.UUID, matter_id: uuid.UUID, org_id: uuid.UUID) -> MatterNote:
        result = await self.db.execute(
            select(MatterNote).where(
                MatterNote.id == note_id,
                MatterNote.matter_id == matter_id,
                MatterNote.organisation_id == org_id,
            )
        )
        note = result.scalar_one_or_none()
        if not note:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")
        return note

    async def _get_author_name(self, user_id: uuid.UUID) -> str:
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        return user.full_name if user else "Unknown"

    def _note_type(self, body: str | None, svg_content: str | None) -> MatterNoteType:
        has_body = bool(body and body.strip())
        has_svg = bool(svg_content and svg_content.strip())
        if has_body and has_svg:
            return MatterNoteType.mixed
        if has_svg:
            return MatterNoteType.handwritten
        return MatterNoteType.typed

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
            payload={"event_id": str(event.id), "title": event.title, "event_type": event.event_type.value},
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
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="ends_at must be after starts_at")

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
            payload={"event_id": str(event.id), "title": event.title, "google_event_id": event.google_event_id},
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

    async def list_notes(
        self,
        matter_id: uuid.UUID,
        org_id: uuid.UUID,
        event_id: uuid.UUID | None = None,
    ) -> list[MatterNote]:
        await self._get_matter(matter_id, org_id)
        query = select(MatterNote).where(
            MatterNote.matter_id == matter_id,
            MatterNote.organisation_id == org_id,
        )
        if event_id:
            query = query.where(MatterNote.event_id == event_id)
        result = await self.db.execute(query.order_by(MatterNote.updated_at.desc()))
        return list(result.scalars().all())

    async def recent_notes(self, org_id: uuid.UUID, limit: int = 20) -> list[MatterNote]:
        result = await self.db.execute(
            select(MatterNote)
            .where(MatterNote.organisation_id == org_id)
            .order_by(MatterNote.updated_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def create_note(
        self,
        matter_id: uuid.UUID,
        org_id: uuid.UUID,
        user_id: uuid.UUID,
        data: MatterNoteCreate,
        created_from_task_comment_id: uuid.UUID | None = None,
    ) -> MatterNote:
        await self._get_matter(matter_id, org_id)
        if data.event_id:
            await self._get_event(data.event_id, matter_id, org_id)

        author_name = await self._get_author_name(user_id)
        note = MatterNote(
            matter_id=matter_id,
            event_id=data.event_id,
            organisation_id=org_id,
            author_id=user_id,
            created_from_task_comment_id=created_from_task_comment_id,
            author_name=author_name,
            title=data.title.strip(),
            body=data.body.strip() if data.body else None,
            svg_content=data.svg_content.strip() if data.svg_content else None,
            note_type=self._note_type(data.body, data.svg_content),
        )
        self.db.add(note)
        await self.db.flush()

        await self.activity.log(
            matter_id=matter_id,
            org_id=org_id,
            actor_id=user_id,
            event_type="matter_note_created",
            payload={"note_id": str(note.id), "title": note.title, "event_id": str(note.event_id) if note.event_id else None},
        )

        await self.db.commit()
        await self.db.refresh(note)
        return note

    async def update_note(
        self,
        note_id: uuid.UUID,
        matter_id: uuid.UUID,
        org_id: uuid.UUID,
        user_id: uuid.UUID,
        data: MatterNoteUpdate,
    ) -> MatterNote:
        note = await self._get_note(note_id, matter_id, org_id)
        update_data = data.model_dump(exclude_unset=True)
        if "event_id" in update_data and update_data["event_id"] is not None:
            await self._get_event(update_data["event_id"], matter_id, org_id)

        for field, value in update_data.items():
            if isinstance(value, str):
                value = value.strip() or None
            setattr(note, field, value)

        note.note_type = self._note_type(note.body, note.svg_content)
        await self.activity.log(
            matter_id=matter_id,
            org_id=org_id,
            actor_id=user_id,
            event_type="matter_note_updated",
            payload={"note_id": str(note.id), "title": note.title},
        )
        await self.db.commit()
        await self.db.refresh(note)
        return note

    async def delete_note(
        self,
        note_id: uuid.UUID,
        matter_id: uuid.UUID,
        org_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> None:
        note = await self._get_note(note_id, matter_id, org_id)
        await self.activity.log(
            matter_id=matter_id,
            org_id=org_id,
            actor_id=user_id,
            event_type="matter_note_deleted",
            payload={"note_id": str(note.id), "title": note.title},
        )
        await self.db.delete(note)
        await self.db.commit()

    async def add_comment_to_note(
        self,
        task_id: uuid.UUID,
        comment_id: uuid.UUID,
        matter_id: uuid.UUID,
        note_id: uuid.UUID,
        org_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> MatterNote:
        comment_result = await self.db.execute(
            select(TaskComment).where(
                and_(
                    TaskComment.id == comment_id,
                    TaskComment.task_id == task_id,
                    TaskComment.matter_id == matter_id,
                    TaskComment.organisation_id == org_id,
                )
            )
        )
        comment = comment_result.scalar_one_or_none()
        if not comment:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")

        note = await self._get_note(note_id, matter_id, org_id)
        existing = note.body.strip() if note.body else ""
        prefix = f"Task comment from {comment.author_name} ({comment.created_at.isoformat()}):\n{comment.body}"
        note.body = f"{existing}\n\n{prefix}".strip() if existing else prefix
        note.note_type = self._note_type(note.body, note.svg_content)

        await self.activity.log(
            matter_id=matter_id,
            org_id=org_id,
            actor_id=user_id,
            event_type="task_comment_added_to_note",
            payload={"task_id": str(task_id), "comment_id": str(comment.id), "note_id": str(note.id)},
        )

        await self.db.commit()
        await self.db.refresh(note)
        return note
