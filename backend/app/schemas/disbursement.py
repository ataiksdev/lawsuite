# backend/app/schemas/disbursement.py
import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field

from app.models.disbursement import DisbursementType

# ─── Requests ────────────────────────────────────────────────────────────────


class DisbursementCreate(BaseModel):
    type: DisbursementType
    description: str = Field(..., min_length=1, max_length=500)
    amount_kobo: int = Field(..., gt=0)
    incurred_at: date
    notes: str | None = None


class DisbursementUpdate(BaseModel):
    type: DisbursementType | None = None
    description: str | None = Field(None, min_length=1, max_length=500)
    amount_kobo: int | None = Field(None, gt=0)
    incurred_at: date | None = None
    notes: str | None = None


# ─── Responses ───────────────────────────────────────────────────────────────


class DisbursementResponse(BaseModel):
    id: uuid.UUID
    organisation_id: uuid.UUID
    matter_id: uuid.UUID
    type: DisbursementType
    description: str
    amount_kobo: int
    incurred_at: date
    invoiced: bool
    invoice_line_item_id: uuid.UUID | None
    notes: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
