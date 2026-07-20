# backend/app/api/invoice_payments.py
"""
Invoice Payments API — top-level, /invoice-payments. Manual recording only
in this pass — no Paystack checkout, no webhook.

Routes:
  POST /invoice-payments                — record a manual payment
  GET  /invoice-payments?invoice_id=... — list payments for an invoice
"""
import uuid

from fastapi import APIRouter, Query, status

from app.core.deps import ScopedDB, AuthUser, MemberUser
from app.schemas.payment import PaymentCreate, PaymentResponse
from app.services.invoice_payment_service import InvoicePaymentService

router = APIRouter()


@router.post("", response_model=PaymentResponse, status_code=status.HTTP_201_CREATED)
async def record_payment(payload: PaymentCreate, current_user: MemberUser, db: ScopedDB):
    service = InvoicePaymentService(db)
    payment = await service.record_payment(current_user.org_id, current_user.user_id, payload)
    return PaymentResponse.model_validate(payment)


@router.get("", response_model=list[PaymentResponse])
async def list_payments(
    current_user: AuthUser,
    db: ScopedDB,
    invoice_id: uuid.UUID = Query(...),
):
    service = InvoicePaymentService(db)
    payments = await service.list_payments(invoice_id, current_user.org_id)
    return [PaymentResponse.model_validate(p) for p in payments]
