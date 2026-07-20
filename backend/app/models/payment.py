import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class PaymentMethod(str, enum.Enum):
    paystack = "paystack"
    bank_transfer = "bank_transfer"
    cash = "cash"
    cheque = "cheque"


class Payment(Base):
    __tablename__ = "payments"
    __table_args__ = (UniqueConstraint("organisation_id", "reference", name="uq_payments_org_reference"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organisation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    invoice_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False, index=True
    )

    amount_kobo: Mapped[int] = mapped_column(Integer, nullable=False)
    method: Mapped[PaymentMethod] = mapped_column(SAEnum(PaymentMethod), nullable=False)
    paid_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # Idempotency key: Paystack tx reference, or a manually-entered bank
    # transfer reference. Unique per-organisation (not globally) so a
    # replayed webhook or two unrelated firms picking the same manual
    # reference string can't collide with each other.
    reference: Mapped[str] = mapped_column(String(255), nullable=False)

    wht_withheld_kobo: Mapped[int | None] = mapped_column(Integer)
    wht_credit_note_received: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    invoice: Mapped["Invoice"] = relationship(back_populates="payments")

    def __repr__(self) -> str:
        return f"<Payment id={self.id} invoice_id={self.invoice_id} amount_kobo={self.amount_kobo}>"
