# backend/app/schemas/matter.py
import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.matter import MatterStatus, MatterType
from app.schemas.client import ClientSummary

# ─── Requests ────────────────────────────────────────────────────────────────


class MatterCreate(BaseModel):
    client_id: uuid.UUID
    title: str = Field(..., min_length=2, max_length=255)
    matter_type: MatterType
    description: str | None = None
    assigned_to: uuid.UUID | None = None
    target_close_at: datetime | None = None


class MatterUpdate(BaseModel):
    title: str | None = Field(None, min_length=2, max_length=255)
    matter_type: MatterType | None = None
    description: str | None = None
    assigned_to: uuid.UUID | None = None
    target_close_at: datetime | None = None
    client_id: uuid.UUID | None = None


class StatusUpdate(BaseModel):
    status: MatterStatus
    reason: str | None = Field(None, max_length=500)


# ─── Email link schemas ───────────────────────────────────────────────────────


class EmailLinkRequest(BaseModel):
    gmail_thread_id: str = Field(..., min_length=1)


class MatterEmailResponse(BaseModel):
    id: uuid.UUID
    matter_id: uuid.UUID
    gmail_thread_id: str
    subject: str | None
    snippet: str | None
    linked_at: datetime

    model_config = {"from_attributes": True}


# ─── Template doc schemas ─────────────────────────────────────────────────────


class GenerateFromTemplateRequest(BaseModel):
    template_file_id: str = Field(..., min_length=1)
    document_name: str = Field(..., min_length=1, max_length=255)
    doc_type: str = "other"
    extra_substitutions: dict[str, str] = {}


# ─── Responses ───────────────────────────────────────────────────────────────


class ActivityLogResponse(BaseModel):
    id: uuid.UUID
    event_type: str
    payload: dict
    actor_id: uuid.UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}


class MatterResponse(BaseModel):
    id: uuid.UUID
    organisation_id: uuid.UUID
    client_id: uuid.UUID
    client: ClientSummary | None = None
    assigned_to: uuid.UUID | None
    title: str
    reference_no: str
    matter_type: MatterType
    status: MatterStatus
    description: str | None
    drive_folder_url: str | None
    opened_at: datetime
    target_close_at: datetime | None
    closed_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MatterListResponse(BaseModel):
    """Paginated matter list."""

    items: list[MatterResponse]
    total: int
    page: int
    page_size: int
    pages: int
