import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class CalendarEventType(str, enum.Enum):
    court_date = "court_date"
    deadline = "deadline"
    meeting = "meeting"
    reminder = "reminder"
    other = "other"


class CalendarSyncStatus(str, enum.Enum):
    never_synced = "never_synced"
    synced = "synced"
    sync_error = "sync_error"


class CalendarEvent(Base):
    __tablename__ = "calendar_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    matter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("matters.id", ondelete="CASCADE"), nullable=False, index=True
    )
    organisation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    event_type: Mapped[CalendarEventType] = mapped_column(
        SAEnum(CalendarEventType), default=CalendarEventType.other, nullable=False, index=True
    )
    location: Mapped[str | None] = mapped_column(String(255))
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    all_day: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    google_event_id: Mapped[str | None] = mapped_column(String(255), index=True)
    google_event_url: Mapped[str | None] = mapped_column(Text)
    google_sync_status: Mapped[CalendarSyncStatus] = mapped_column(
        SAEnum(CalendarSyncStatus), default=CalendarSyncStatus.never_synced, nullable=False
    )
    google_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    google_last_error: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    matter: Mapped["Matter"] = relationship(back_populates="calendar_events")
    notes: Mapped[list["Note"]] = relationship(back_populates="event")

    def __repr__(self) -> str:
        return f"<CalendarEvent id={self.id} title={self.title} type={self.event_type}>"
