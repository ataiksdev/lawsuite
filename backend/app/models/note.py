# backend/app/models/note.py
"""
Standalone Note model.

A note belongs to an organisation and optionally to:
  - a matter  (matter_id)
  - a calendar event (event_id)
  - a task comment it was created from (created_from_task_comment_id)

matter_id is intentionally nullable so notes can exist without a matter.
The table is still named matter_notes for backward compatibility with the
existing migration; a future rename migration can change this if desired.
"""
import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class NoteType(str, enum.Enum):
    typed = "typed"
    handwritten = "handwritten"
    mixed = "mixed"


class Note(Base):
    __tablename__ = "matter_notes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Both nullable — note can be completely standalone
    matter_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("matters.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    event_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("calendar_events.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    organisation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    author_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_from_task_comment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("task_comments.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    author_name: Mapped[str] = mapped_column(String(255), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str | None] = mapped_column(Text)
    svg_content: Mapped[str | None] = mapped_column(Text)
    note_type: Mapped[NoteType] = mapped_column(SAEnum(NoteType, name="matternotetype"), nullable=False, index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Optional relationships
    matter: Mapped["Matter | None"] = relationship(back_populates="notes")
    event: Mapped["CalendarEvent | None"] = relationship(back_populates="notes")

    def __repr__(self) -> str:
        return f"<Note id={self.id} title={self.title} type={self.note_type}>"
