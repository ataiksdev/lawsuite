import enum
import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class InvoiceStatus(str, enum.Enum):
    draft = "draft"
    sent = "sent"
    part_paid = "part_paid"
    paid = "paid"
    overdue = "overdue"
    void = "void"
    written_off = "written_off"


class Invoice(Base):
    __tablename__ = "invoices"
    __table_args__ = (
        UniqueConstraint("organisation_id", "number", name="uq_invoices_org_number"),
        UniqueConstraint("organisation_id", "idempotency_key", name="uq_invoices_org_idempotency_key"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organisation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    idempotency_key: Mapped[str | None] = mapped_column(String(100))

    # Nullable — assigned only by issue_invoice() so abandoned drafts don't
    # burn numbers out of sequence. An invoice can span multiple matters (or
    # none, e.g. a firm-level retainer), so there is deliberately no
    # matter_id column here — see InvoiceLineItem.matter_id instead.
    number: Mapped[str | None] = mapped_column(String(50), index=True)
    status: Mapped[InvoiceStatus] = mapped_column(
        SAEnum(InvoiceStatus), default=InvoiceStatus.draft, nullable=False, index=True
    )

    issue_date: Mapped[date] = mapped_column(Date, nullable=False)
    due_date: Mapped[date | None] = mapped_column(Date)
    currency: Mapped[str] = mapped_column(String(3), default="NGN", nullable=False)

    # Always server-derived from line items + vat_kobo/wht_kobo — never
    # independently client-settable.
    subtotal_kobo: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    disbursements_kobo: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_kobo: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    net_payable_kobo: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    amount_paid_kobo: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Recomputed from tax_engine on every line-item mutation, unless
    # explicitly overridden via PATCH — see invoice_service._recompute_totals.
    vat_kobo: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    wht_kobo: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    vat_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # No column default — set once at creation via tax_engine.wht_applies(),
    # then a plain editable toggle.
    wht_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False)

    # Legal Practitioners Act "Bill of Charges" — service starts the
    # statutory clock before the firm may sue to recover fees. Metadata
    # only: served_at is staff-entered, nothing here is enforced or
    # automated. See invoice_service.BILL_OF_CHARGES_WAITING_PERIOD_DAYS
    # [VERIFY with counsel — commonly cited as LPA Cap L11 LFN 2004 s.16,
    # unconfirmed] for the derived eligible_to_sue_date.
    is_bill_of_charges: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    served_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    notes: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    organisation: Mapped["Organisation"] = relationship()
    client: Mapped["Client"] = relationship()
    line_items: Mapped[list["InvoiceLineItem"]] = relationship(
        back_populates="invoice", cascade="all, delete-orphan"
    )
    payments: Mapped[list["Payment"]] = relationship(back_populates="invoice", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Invoice id={self.id} number={self.number} status={self.status}>"
