import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Organisation(Base):
    __tablename__ = "organisations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # paystack
    paystack_customer_code: Mapped[str | None] = mapped_column(String(255), unique=True)
    plan: Mapped[str] = mapped_column(String(50), default="free", nullable=False)

    # Google Workspace integration
    google_access_token: Mapped[str | None] = mapped_column(Text)
    google_refresh_token: Mapped[str | None] = mapped_column(Text)
    google_token_expiry: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    google_scopes: Mapped[str | None] = mapped_column(Text)

    # Drive webhook channel (Phase 6)
    drive_webhook_channel_id: Mapped[str | None] = mapped_column(String(255))
    drive_webhook_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Trial and feature flags
    trial_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    trial_used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    feature_flags: Mapped[dict | list | None] = mapped_column(JSONB)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Relationships
    members: Mapped[list["OrganisationMember"]] = relationship(
        back_populates="organisation", cascade="all, delete-orphan"
    )
    clients: Mapped[list["Client"]] = relationship(back_populates="organisation", cascade="all, delete-orphan")
    matters: Mapped[list["Matter"]] = relationship(back_populates="organisation", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Organisation id={self.id} name={self.name}>"
