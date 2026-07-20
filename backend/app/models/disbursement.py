import enum
import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class DisbursementType(str, enum.Enum):
    agency = "agency"      # third-party pass-through — court filing, stamp duty, CAC fees. Not VATable.
    recharge = "recharge"  # firm's own cost recharged to client — courier, printing. VATable.


class Disbursement(Base):
    __tablename__ = "disbursements"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organisation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    matter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("matters.id", ondelete="CASCADE"), nullable=False, index=True
    )

    type: Mapped[DisbursementType] = mapped_column(SAEnum(DisbursementType), nullable=False)
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    amount_kobo: Mapped[int] = mapped_column(Integer, nullable=False)
    incurred_at: Mapped[date] = mapped_column(Date, nullable=False)

    invoiced: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    invoice_line_item_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("invoice_line_items.id", ondelete="SET NULL")
    )

    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    matter: Mapped["Matter"] = relationship(back_populates="disbursements")

    def __repr__(self) -> str:
        return f"<Disbursement id={self.id} matter_id={self.matter_id} amount_kobo={self.amount_kobo}>"
