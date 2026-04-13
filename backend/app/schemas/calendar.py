import uuid
from datetime import datetime

from pydantic import BaseModel, Field, model_validator

from app.models.calendar_event import CalendarEventType, CalendarSyncStatus
from app.models.matter_note import MatterNoteType


class CalendarEventCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=255)
    description: str | None = None
    event_type: CalendarEventType = CalendarEventType.other
    location: str | None = Field(None, max_length=255)
    starts_at: datetime
    ends_at: datetime | None = None
    all_day: bool = False

    @model_validator(mode="after")
    def validate_dates(self) -> "CalendarEventCreate":
        if self.ends_at and self.ends_at < self.starts_at:
            raise ValueError("ends_at must be after starts_at")
        return self


class CalendarEventUpdate(BaseModel):
    title: str | None = Field(None, min_length=2, max_length=255)
    description: str | None = None
    event_type: CalendarEventType | None = None
    location: str | None = Field(None, max_length=255)
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    all_day: bool | None = None

    @model_validator(mode="after")
    def validate_dates(self) -> "CalendarEventUpdate":
        if self.starts_at and self.ends_at and self.ends_at < self.starts_at:
            raise ValueError("ends_at must be after starts_at")
        return self


class CalendarEventResponse(BaseModel):
    id: uuid.UUID
    matter_id: uuid.UUID
    organisation_id: uuid.UUID
    created_by: uuid.UUID | None
    title: str
    description: str | None
    event_type: CalendarEventType
    location: str | None
    starts_at: datetime
    ends_at: datetime | None
    all_day: bool
    google_event_id: str | None
    google_event_url: str | None
    google_sync_status: CalendarSyncStatus
    google_synced_at: datetime | None
    google_last_error: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CalendarEventListResponse(BaseModel):
    items: list[CalendarEventResponse]
    total: int


class MatterNoteCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=255)
    body: str | None = None
    svg_content: str | None = None
    event_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def validate_content(self) -> "MatterNoteCreate":
        if not (self.body and self.body.strip()) and not (self.svg_content and self.svg_content.strip()):
            raise ValueError("Provide note body and/or svg_content")
        return self


class MatterNoteUpdate(BaseModel):
    title: str | None = Field(None, min_length=2, max_length=255)
    body: str | None = None
    svg_content: str | None = None
    event_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def validate_content(self) -> "MatterNoteUpdate":
        if self.body is not None or self.svg_content is not None:
            has_body = bool(self.body and self.body.strip())
            has_svg = bool(self.svg_content and self.svg_content.strip())
            if not has_body and not has_svg:
                raise ValueError("Provide note body and/or svg_content")
        return self


class MatterNoteResponse(BaseModel):
    id: uuid.UUID
    matter_id: uuid.UUID
    event_id: uuid.UUID | None
    organisation_id: uuid.UUID
    author_id: uuid.UUID | None
    created_from_task_comment_id: uuid.UUID | None
    author_name: str
    title: str
    body: str | None
    svg_content: str | None
    note_type: MatterNoteType
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AddCommentToNoteRequest(BaseModel):
    note_id: uuid.UUID

