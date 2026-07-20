# backend/app/schemas/fee_arrangement.py
import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.fee_arrangement import FeeArrangementType

# ─── Requests ────────────────────────────────────────────────────────────────


class FeeArrangementCreate(BaseModel):
    type: FeeArrangementType
    params: dict = {}


class FeeArrangementUpdate(BaseModel):
    type: FeeArrangementType | None = None
    params: dict | None = None
    is_active: bool | None = None


# ─── Responses ───────────────────────────────────────────────────────────────


class FeeArrangementResponse(BaseModel):
    id: uuid.UUID
    organisation_id: uuid.UUID
    matter_id: uuid.UUID
    type: FeeArrangementType
    params: dict
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
