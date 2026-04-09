# backend/app/schemas/client.py
import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

# ─── Requests ────────────────────────────────────────────────────────────────


class ClientCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    email: EmailStr | None = None
    phone: str | None = Field(None, max_length=50)
    address: str | None = Field(None, max_length=1000)
    notes: str | None = None


class ClientUpdate(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=255)
    email: EmailStr | None = None
    phone: str | None = Field(None, max_length=50)
    address: str | None = Field(None, max_length=1000)
    notes: str | None = None


# ─── Responses ───────────────────────────────────────────────────────────────


class ClientResponse(BaseModel):
    id: uuid.UUID
    organisation_id: uuid.UUID
    name: str
    email: str | None
    phone: str | None
    address: str | None
    notes: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ClientSummary(BaseModel):
    """Lightweight client shape used inside matter responses."""

    id: uuid.UUID
    name: str
    email: str | None

    model_config = {"from_attributes": True}
