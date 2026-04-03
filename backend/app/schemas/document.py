# backend/app/schemas/document.py
import uuid
from datetime import datetime
from pydantic import BaseModel, Field
from app.models.matter_document import DocumentType, DocumentStatus


# ─── Document requests ────────────────────────────────────────────────────────

class DocumentLink(BaseModel):
    """Link an existing Drive file to a matter."""
    name: str = Field(..., min_length=1, max_length=255)
    drive_file_id: str = Field(..., min_length=1)
    drive_url: str = Field(..., min_length=1)
    doc_type: DocumentType = DocumentType.other
    label: str | None = Field(None, max_length=255)  # e.g. "unsigned draft"


class DocumentVersionUpload(BaseModel):
    """Add a new version to an existing document record."""
    drive_file_id: str = Field(..., min_length=1)
    drive_url: str = Field(..., min_length=1)
    label: str | None = Field(None, max_length=255)  # e.g. "signed copy"
    notes: str | None = None


class DocumentStatusUpdate(BaseModel):
    status: DocumentStatus


class GenerateFromTemplateRequest(BaseModel):
    """Generate a new document from a Google Docs template file."""
    template_file_id: str = Field(..., min_length=1)
    document_name: str = Field(..., min_length=1, max_length=255)
    doc_type: str = "other"
    extra_substitutions: dict[str, str] = {}


# ─── Document responses ───────────────────────────────────────────────────────

class DocumentVersionResponse(BaseModel):
    id: uuid.UUID
    document_id: uuid.UUID
    version_number: int
    label: str | None
    drive_file_id: str
    drive_url: str
    notes: str | None
    uploaded_by: uuid.UUID | None
    uploaded_at: datetime

    model_config = {"from_attributes": True}


class DocumentResponse(BaseModel):
    id: uuid.UUID
    matter_id: uuid.UUID
    organisation_id: uuid.UUID
    name: str
    doc_type: DocumentType
    status: DocumentStatus
    current_version: int
    drive_file_id: str | None
    drive_url: str | None
    added_by: uuid.UUID | None
    added_at: datetime
    updated_at: datetime
    versions: list[DocumentVersionResponse] = []

    model_config = {"from_attributes": True}


# ─── Drive file listing (from Drive API directly) ─────────────────────────────

class DriveFileResponse(BaseModel):
    """Raw Drive file metadata returned from the Drive API listing."""
    id: str
    name: str
    mime_type: str
    web_view_link: str
    modified_time: str | None
    size: str | None