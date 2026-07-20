# backend/app/schemas/payment.py
import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.payment import PaymentMethod

# ─── Requests ────────────────────────────────────────────────────────────────


class PaymentCreate(BaseModel):
    invoice_id: uuid.UUID
    # gt=0 rejects zero-amount payments — recording one would spuriously
    # flip an invoice with net_payable_kobo == 0 to "paid" with no real
    # money having moved.
    amount_kobo: int = Field(..., gt=0)
    method: PaymentMethod
    paid_at: datetime
    reference: str = Field(..., min_length=1, max_length=255)
    wht_withheld_kobo: int | None = Field(None, ge=0)
    wht_credit_note_received: bool = False


# ─── Responses ───────────────────────────────────────────────────────────────


class PaymentResponse(BaseModel):
    id: uuid.UUID
    organisation_id: uuid.UUID
    invoice_id: uuid.UUID
    amount_kobo: int
    method: PaymentMethod
    paid_at: datetime
    reference: str
    wht_withheld_kobo: int | None
    wht_credit_note_received: bool
    created_at: datetime

    model_config = {"from_attributes": True}
