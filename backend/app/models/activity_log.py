import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.core.database import Base


class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    matter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("matters.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    organisation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    # Null actor means the event was triggered by an external system (e.g. Google webhook)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )

    event_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    # Flexible payload — stores before/after values, metadata, etc.
    # Examples:
    #   matter_created:   {"title": "...", "type": "compliance"}
    #   status_changed:   {"from": "open", "to": "pending", "reason": "..."}
    #   task_completed:   {"task_id": "...", "task_title": "..."}
    #   document_added:   {"document_id": "...", "name": "...", "doc_type": "..."}
    #   document_edited:  {"document_id": "...", "edited_by": "...", "change_type": "edit"}
    #   email_linked:     {"thread_id": "...", "subject": "..."}
    payload: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, nullable=False, index=True
    )

    # Relationships
    matter: Mapped["Matter"] = relationship(back_populates="activity_logs")

    # Composite index for report queries: fetch all activity for an org in a date range
    __table_args__ = (
        Index("ix_activity_log_org_created", "organisation_id", "created_at"),
        Index("ix_activity_log_matter_created", "matter_id", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<ActivityLog id={self.id} event={self.event_type} matter={self.matter_id}>"
