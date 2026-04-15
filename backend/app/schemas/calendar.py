# backend/app/schemas/calendar.py
import uuid
from datetime import datetime

from pydantic import BaseModel, Field, model_validator

from app.models.calendar_event import CalendarEventType, CalendarSyncStatus


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
