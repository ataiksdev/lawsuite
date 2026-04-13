# backend/app/schemas/note.py
"""
Schemas for the standalone Notes feature.

matter_id and event_id are both optional — a note can be completely standalone,
linked to a matter only, linked to an event only, or linked to both.
"""
import uuid
from datetime import datetime

from pydantic import BaseModel, Field, model_validator

from app.models.note import NoteType


class NoteCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=255)
    body: str | None = None
    svg_content: str | None = None
    # Optional links
    matter_id: uuid.UUID | None = None
    event_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def validate_content(self) -> "NoteCreate":
        if not (self.body and self.body.strip()) and not (self.svg_content and self.svg_content.strip()):
            raise ValueError("Provide note body and/or svg_content")
        return self


class NoteUpdate(BaseModel):
    title: str | None = Field(None, min_length=2, max_length=255)
    body: str | None = None
    svg_content: str | None = None
    matter_id: uuid.UUID | None = None
    event_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def validate_content(self) -> "NoteUpdate":
        # Only validate if both are being explicitly set to empty
        if self.body is not None or self.svg_content is not None:
            has_body = bool(self.body and self.body.strip())
            has_svg = bool(self.svg_content and self.svg_content.strip())
            if not has_body and not has_svg:
                raise ValueError("Provide note body and/or svg_content")
        return self


class NoteResponse(BaseModel):
    id: uuid.UUID
    matter_id: uuid.UUID | None
    event_id: uuid.UUID | None
    organisation_id: uuid.UUID
    author_id: uuid.UUID | None
    created_from_task_comment_id: uuid.UUID | None
    author_name: str
    title: str
    body: str | None
    svg_content: str | None
    note_type: NoteType
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AddCommentToNoteRequest(BaseModel):
    """Append a task comment's body into a note. matter_id is derived from the task."""
    note_id: uuid.UUID
    task_id: uuid.UUID
    comment_id: uuid.UUID
