import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class UserRole(str, enum.Enum):
    admin = "admin"
    member = "member"
    viewer = "viewer"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str | None] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # ── Google OAuth identity (sign-in with Google) ───────────────────────
    # Separate from the workspace Google integration on Organisation.
    # A user can have both a password and a Google OAuth link.
    google_oauth_id: Mapped[str | None] = mapped_column(String(255), unique=True, index=True)
    google_oauth_email: Mapped[str | None] = mapped_column(String(255))
    google_avatar_url: Mapped[str | None] = mapped_column(Text)

    # ── MFA (TOTP — optional for all roles) ──────────────────────────────
    mfa_secret: Mapped[str | None] = mapped_column(String(255))  # Fernet-encrypted
    mfa_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # 8 single-use backup codes stored as JSON list of bcrypt hashes
    mfa_backup_codes: Mapped[list | None] = mapped_column(JSONB)

    # Invite flow
    invite_token: Mapped[str | None] = mapped_column(String(255), unique=True)
    invite_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Relationships
    memberships: Mapped[list["OrganisationMember"]] = relationship(back_populates="user", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email}>"


class OrganisationMember(Base):
    __tablename__ = "organisation_members"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organisation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[UserRole] = mapped_column(SAEnum(UserRole), default=UserRole.member, nullable=False)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    # Relationships
    organisation: Mapped["Organisation"] = relationship(back_populates="members")
    user: Mapped["User"] = relationship(back_populates="memberships")

    def __repr__(self) -> str:
        return f"<OrganisationMember user={self.user_id} org={self.organisation_id} role={self.role}>"
