import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class MatterStatus(str, enum.Enum):
    intake = "intake"
    open = "open"
    pending = "pending"
    in_review = "in_review"
    closed = "closed"
    archived = "archived"


class MatterType(str, enum.Enum):
    advisory = "advisory"
    litigation = "litigation"
    compliance = "compliance"
    drafting = "drafting"
    transactional = "transactional"


class Matter(Base):
    __tablename__ = "matters"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organisation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    assigned_to: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    reference_no: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    matter_type: Mapped[MatterType] = mapped_column(SAEnum(MatterType), nullable=False)
    status: Mapped[MatterStatus] = mapped_column(
        SAEnum(MatterStatus), default=MatterStatus.intake, nullable=False, index=True
    )
    description: Mapped[str | None] = mapped_column(Text)

    # Google Drive
    drive_folder_url: Mapped[str | None] = mapped_column(Text)
    drive_folder_id: Mapped[str | None] = mapped_column(String(255))

    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    target_close_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Relationships
    organisation: Mapped["Organisation"] = relationship(back_populates="matters")
    client: Mapped["Client"] = relationship(back_populates="matters")
    tasks: Mapped[list["Task"]] = relationship(back_populates="matter", cascade="all, delete-orphan")
    documents: Mapped[list["MatterDocument"]] = relationship(back_populates="matter", cascade="all, delete-orphan")
    emails: Mapped[list["MatterEmail"]] = relationship(back_populates="matter", cascade="all, delete-orphan")
    activity_logs: Mapped[list["ActivityLog"]] = relationship(back_populates="matter", cascade="all, delete-orphan")
    calendar_events: Mapped[list["CalendarEvent"]] = relationship(
        back_populates="matter", cascade="all, delete-orphan"
    )
    notes: Mapped[list["Note"]] = relationship(back_populates="matter")

    def __repr__(self) -> str:
        return f"<Matter id={self.id} ref={self.reference_no} status={self.status}>"
