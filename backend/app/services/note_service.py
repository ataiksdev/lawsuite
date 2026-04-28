# backend/app/services/note_service.py
"""
NoteService — standalone notes that optionally link to a matter / calendar event.

matter_id is optional throughout. When provided it is validated against the
org but never used as a required lookup key.
"""
import uuid

from fastapi import HTTPException, status
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.calendar_event import CalendarEvent
from app.models.matter import Matter
from app.models.note import Note, NoteType
from app.models.task_comment import TaskComment
from app.models.user import User
from app.schemas.note import NoteCreate, NoteUpdate


class NoteService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ── Helpers ───────────────────────────────────────────────────────────

    async def _get_author_name(self, user_id: uuid.UUID) -> str:
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        return user.full_name if user else "Unknown"

    async def _validate_matter(self, matter_id: uuid.UUID, org_id: uuid.UUID) -> Matter:
        result = await self.db.execute(
            select(Matter).where(Matter.id == matter_id, Matter.organisation_id == org_id)
        )
        matter = result.scalar_one_or_none()
        if not matter:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Matter not found")
        return matter

    async def _validate_event(self, event_id: uuid.UUID, org_id: uuid.UUID) -> CalendarEvent:
        result = await self.db.execute(
            select(CalendarEvent).where(
                CalendarEvent.id == event_id,
                CalendarEvent.organisation_id == org_id,
            )
        )
        event = result.scalar_one_or_none()
        if not event:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Calendar event not found")
        return event

    async def _get_note(self, note_id: uuid.UUID, org_id: uuid.UUID) -> Note:
        result = await self.db.execute(
            select(Note).where(Note.id == note_id, Note.organisation_id == org_id)
        )
        note = result.scalar_one_or_none()
        if not note:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")
        return note

    @staticmethod
    def _note_type(body: str | None, svg_content: str | None) -> NoteType:
        has_body = bool(body and body.strip())
        has_svg = bool(svg_content and svg_content.strip())
        if has_body and has_svg:
            return NoteType.mixed
        if has_svg:
            return NoteType.handwritten
        return NoteType.typed

    # ── List ──────────────────────────────────────────────────────────────

    async def list_notes(
        self,
        org_id: uuid.UUID,
        matter_id: uuid.UUID | None = None,
        event_id: uuid.UUID | None = None,
        task_id: uuid.UUID | None = None,
        limit: int = 50,
    ) -> list[Note]:
        query = select(Note).where(Note.organisation_id == org_id)
        if matter_id is not None:
            query = query.where(Note.matter_id == matter_id)
        if event_id is not None:
            query = query.where(Note.event_id == event_id)
        if task_id is not None:
            query = query.where(Note.task_id == task_id)
        query = query.order_by(Note.updated_at.desc()).limit(limit)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    # ── Create ────────────────────────────────────────────────────────────

    async def create_note(
        self,
        org_id: uuid.UUID,
        user_id: uuid.UUID,
        data: NoteCreate,
        created_from_task_comment_id: uuid.UUID | None = None,
    ) -> Note:
        # Validate optional links
        if data.matter_id:
            await self._validate_matter(data.matter_id, org_id)
        if data.event_id:
            await self._validate_event(data.event_id, org_id)

        author_name = await self._get_author_name(user_id)
        note = Note(
            matter_id=data.matter_id,
            event_id=data.event_id,
            task_id=data.task_id,
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
        await self.db.commit()
        await self.db.refresh(note)
        return note

    # ── Update ────────────────────────────────────────────────────────────

    async def update_note(
        self,
        note_id: uuid.UUID,
        org_id: uuid.UUID,
        user_id: uuid.UUID,
        data: NoteUpdate,
    ) -> Note:
        note = await self._get_note(note_id, org_id)
        update_data = data.model_dump(exclude_unset=True)

        if "matter_id" in update_data and update_data["matter_id"] is not None:
            await self._validate_matter(update_data["matter_id"], org_id)
        if "event_id" in update_data and update_data["event_id"] is not None:
            await self._validate_event(update_data["event_id"], org_id)

        for field, value in update_data.items():
            if isinstance(value, str):
                value = value.strip() or None
            setattr(note, field, value)

        note.note_type = self._note_type(note.body, note.svg_content)
        await self.db.commit()
        await self.db.refresh(note)
        return note

    # ── Delete ────────────────────────────────────────────────────────────

    async def delete_note(self, note_id: uuid.UUID, org_id: uuid.UUID) -> None:
        note = await self._get_note(note_id, org_id)
        await self.db.delete(note)
        await self.db.commit()

    # ── Add task comment to note ──────────────────────────────────────────

    async def add_comment_to_note(
        self,
        note_id: uuid.UUID,
        task_id: uuid.UUID,
        comment_id: uuid.UUID,
        org_id: uuid.UUID,
    ) -> Note:
        """
        Append a task comment's text into a note's body.

        The task comment must belong to a task whose matter belongs to the
        same org as the note. If the note is linked to a matter, the comment's
        task must belong to that same matter.
        """
        note = await self._get_note(note_id, org_id)

        # Fetch comment — it must be in the org's task scope
        comment_result = await self.db.execute(
            select(TaskComment).where(
                TaskComment.id == comment_id,
                TaskComment.task_id == task_id,
                TaskComment.organisation_id == org_id,
            )
        )
        comment = comment_result.scalar_one_or_none()
        if not comment:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")

        # If note is linked to a matter, enforce the task is on that same matter
        if note.matter_id and comment.matter_id != note.matter_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    "Task comment belongs to a different matter than this note. "
                    "Only comments from tasks on the linked matter can be added."
                ),
            )

        existing = note.body.strip() if note.body else ""
        appended = (
            f"Task comment from {comment.author_name} "
            f"({comment.created_at.strftime('%Y-%m-%d %H:%M')}):\n{comment.body}"
        )
        note.body = f"{existing}\n\n{appended}".strip() if existing else appended
        note.note_type = self._note_type(note.body, note.svg_content)

        await self.db.commit()
        await self.db.refresh(note)
        return note
