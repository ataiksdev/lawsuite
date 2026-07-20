import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class FeeArrangementType(str, enum.Enum):
    fixed = "fixed"
    retainer = "retainer"
    scale = "scale"
    milestone = "milestone"
    recovery = "recovery"
    appearance = "appearance"


class FeeArrangement(Base):
    __tablename__ = "fee_arrangements"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organisation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    matter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("matters.id", ondelete="CASCADE"), nullable=False, index=True
    )

    type: Mapped[FeeArrangementType] = mapped_column(SAEnum(FeeArrangementType), nullable=False)
    # Shape varies by type — amount_kobo, schedule, scale_basis_kobo,
    # milestones: [{label, amount_kobo, invoiced}], percentage, etc.
    # Validated in the Pydantic schema layer per `type`, not here.
    params: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    organisation: Mapped["Organisation"] = relationship()
    matter: Mapped["Matter"] = relationship(back_populates="fee_arrangements")

    def __repr__(self) -> str:
        return f"<FeeArrangement id={self.id} matter_id={self.matter_id} type={self.type}>"
