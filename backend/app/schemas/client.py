# backend/app/schemas/client.py
import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

# ─── Requests ────────────────────────────────────────────────────────────────


class ClientCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    email: EmailStr | None = None
    phone: str | None = Field(None, max_length=50)
    address: str | None = Field(None, max_length=1000)
    notes: str | None = None
    # Invoicing
    client_type: Literal["individual", "corporate"] = "individual"
    tin: str | None = Field(None, max_length=50)
    vat_registered: bool = False
    billing_address: str | None = Field(None, max_length=1000)
    # Client-generated key so a retried request returns the original row
    # instead of creating a duplicate — see ClientService.create_client.
    idempotency_key: str | None = Field(None, max_length=100)


class ClientUpdate(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=255)
    email: EmailStr | None = None
    phone: str | None = Field(None, max_length=50)
    address: str | None = Field(None, max_length=1000)
    notes: str | None = None
    # Invoicing
    client_type: Literal["individual", "corporate"] | None = None
    tin: str | None = Field(None, max_length=50)
    vat_registered: bool | None = None
    billing_address: str | None = Field(None, max_length=1000)


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
    client_type: str
    tin: str | None
    vat_registered: bool
    billing_address: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ClientSummary(BaseModel):
    """Lightweight client shape used inside matter responses."""

    id: uuid.UUID
    name: str
    email: str | None

    model_config = {"from_attributes": True}
