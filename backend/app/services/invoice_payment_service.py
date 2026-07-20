# backend/app/services/invoice_payment_service.py
"""
InvoicePaymentService — manual payment recording only (no Paystack checkout,
no webhook, in this pass). Idempotent on (organisation_id, reference): a
replayed request with the same reference returns the existing payment
unchanged rather than double-crediting the invoice.
"""
import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.invoice import Invoice, InvoiceStatus
from app.models.payment import Payment
from app.schemas.payment import PaymentCreate
from app.services.activity_service import ActivityService
from app.services.invoice_service import _distinct_matter_ids


class InvoicePaymentService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.activity = ActivityService(db)

    # ── Helpers ───────────────────────────────────────────────────────────

    async def _get_invoice(self, invoice_id: uuid.UUID, org_id: uuid.UUID) -> Invoice:
        result = await self.db.execute(
            select(Invoice)
            .options(selectinload(Invoice.line_items))
            .where(Invoice.id == invoice_id, Invoice.organisation_id == org_id)
        )
        invoice = result.scalar_one_or_none()
        if not invoice:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
        return invoice

    # ── Record payment ────────────────────────────────────────────────────

    async def record_payment(self, org_id: uuid.UUID, actor_id: uuid.UUID, data: PaymentCreate) -> Payment:
        invoice = await self._get_invoice(data.invoice_id, org_id)
        if invoice.status not in (InvoiceStatus.sent, InvoiceStatus.part_paid, InvoiceStatus.overdue):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Payments can only be recorded against a sent, part-paid, or overdue invoice",
            )

        existing_result = await self.db.execute(
            select(Payment).where(Payment.organisation_id == org_id, Payment.reference == data.reference)
        )
        existing = existing_result.scalar_one_or_none()
        if existing:
            return existing

        payment = Payment(
            organisation_id=org_id,
            invoice_id=invoice.id,
            amount_kobo=data.amount_kobo,
            method=data.method,
            paid_at=data.paid_at,
            reference=data.reference,
            wht_withheld_kobo=data.wht_withheld_kobo,
            wht_credit_note_received=data.wht_credit_note_received,
        )
        self.db.add(payment)

        invoice.amount_paid_kobo += data.amount_kobo
        invoice.status = (
            InvoiceStatus.paid if invoice.amount_paid_kobo >= invoice.net_payable_kobo else InvoiceStatus.part_paid
        )

        for matter_id in _distinct_matter_ids(invoice):
            await self.activity.log(
                matter_id=matter_id,
                org_id=org_id,
                actor_id=actor_id,
                event_type="invoice_payment_recorded",
                payload={
                    "invoice_id": str(invoice.id),
                    "amount_kobo": data.amount_kobo,
                    "method": data.method.value,
                },
            )

        await self.db.commit()
        await self.db.refresh(payment)
        return payment

    # ── List ──────────────────────────────────────────────────────────────

    async def list_payments(self, invoice_id: uuid.UUID, org_id: uuid.UUID) -> list[Payment]:
        await self._get_invoice(invoice_id, org_id)
        result = await self.db.execute(
            select(Payment)
            .where(Payment.invoice_id == invoice_id, Payment.organisation_id == org_id)
            .order_by(Payment.paid_at.desc())
        )
        return list(result.scalars().all())
