import enum
import uuid

from sqlalchemy import Boolean, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class LineItemKind(str, enum.Enum):
    professional_fee = "professional_fee"
    disbursement = "disbursement"
    expense = "expense"


class InvoiceLineItem(Base):
    __tablename__ = "invoice_line_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organisation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    invoice_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Zero or one matter per line — this, not a column on Invoice itself, is
    # what lets one invoice span multiple matters (or none, e.g. a flat
    # firm-level retainer line).
    matter_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("matters.id", ondelete="SET NULL"), index=True
    )
    # Only meaningful when matter_id is set — a fee arrangement is always
    # per-matter.
    fee_arrangement_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("fee_arrangements.id", ondelete="SET NULL")
    )

    kind: Mapped[LineItemKind] = mapped_column(SAEnum(LineItemKind), nullable=False)
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    quantity: Mapped[float] = mapped_column(Numeric(10, 2), default=1, nullable=False)
    unit_amount_kobo: Mapped[int] = mapped_column(Integer, nullable=False)
    amount_kobo: Mapped[int] = mapped_column(Integer, nullable=False)  # quantity * unit_amount, stored not computed

    # professional_fee: usually True/True. disbursement (agency, pass-through
    # third-party cost like court filing fees): usually False/False.
    # expense (firm's own recharged cost): usually True/False.
    is_vatable: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_wht_applicable: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    notes: Mapped[str | None] = mapped_column(Text)

    invoice: Mapped["Invoice"] = relationship(back_populates="line_items")

    def __repr__(self) -> str:
        return f"<InvoiceLineItem id={self.id} kind={self.kind} amount_kobo={self.amount_kobo}>"
