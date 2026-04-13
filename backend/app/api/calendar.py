# backend/app/api/calendar.py
"""
Calendar API — /calendar

Only calendar events. Notes have moved to /notes.
"""
import uuid
from datetime import datetime

from fastapi import APIRouter, Query, status

from app.core.deps import DB, AuthUser, GoogleCreds
from app.schemas.calendar import (
    CalendarEventCreate,
    CalendarEventListResponse,
    CalendarEventResponse,
    CalendarEventUpdate,
)
from app.services.calendar_service import CalendarService
from app.services.google_calendar_service import GoogleCalendarService

router = APIRouter()


@router.get("/events", response_model=CalendarEventListResponse)
async def list_events(
    current_user: AuthUser,
    db: DB,
    starts_from: datetime | None = Query(None),
    ends_before: datetime | None = Query(None),
    matter_id: uuid.UUID | None = Query(None),
):
    service = CalendarService(db)
    events = await service.list_events(
        org_id=current_user.org_id,
        starts_from=starts_from,
        ends_before=ends_before,
        matter_id=matter_id,
    )
    return CalendarEventListResponse(
        items=[CalendarEventResponse.model_validate(event) for event in events],
        total=len(events),
    )


@router.post("/matters/{matter_id}/events", response_model=CalendarEventResponse, status_code=status.HTTP_201_CREATED)
async def create_event(
    matter_id: uuid.UUID,
    payload: CalendarEventCreate,
    current_user: AuthUser,
    db: DB,
):
    service = CalendarService(db)
    event = await service.create_event(
        matter_id=matter_id,
        org_id=current_user.org_id,
        user_id=current_user.user_id,
        data=payload,
    )
    return CalendarEventResponse.model_validate(event)


@router.patch("/matters/{matter_id}/events/{event_id}", response_model=CalendarEventResponse)
async def update_event(
    matter_id: uuid.UUID,
    event_id: uuid.UUID,
    payload: CalendarEventUpdate,
    current_user: AuthUser,
    db: DB,
):
    service = CalendarService(db)
    event = await service.update_event(
        event_id=event_id,
        matter_id=matter_id,
        org_id=current_user.org_id,
        user_id=current_user.user_id,
        data=payload,
    )
    return CalendarEventResponse.model_validate(event)


@router.delete("/matters/{matter_id}/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(
    matter_id: uuid.UUID,
    event_id: uuid.UUID,
    current_user: AuthUser,
    db: DB,
):
    service = CalendarService(db)
    await service.delete_event(
        event_id=event_id,
        matter_id=matter_id,
        org_id=current_user.org_id,
        user_id=current_user.user_id,
    )


@router.post("/matters/{matter_id}/events/{event_id}/sync", response_model=CalendarEventResponse)
async def sync_event(
    matter_id: uuid.UUID,
    event_id: uuid.UUID,
    current_user: AuthUser,
    google_creds: GoogleCreds,
    db: DB,
):
    service = CalendarService(db)
    event = await service.sync_event_to_google(
        event_id=event_id,
        matter_id=matter_id,
        org_id=current_user.org_id,
        user_id=current_user.user_id,
        google_service=GoogleCalendarService(google_creds),
    )
    return CalendarEventResponse.model_validate(event)


@router.delete("/matters/{matter_id}/events/{event_id}/sync", response_model=CalendarEventResponse)
async def unsync_event(
    matter_id: uuid.UUID,
    event_id: uuid.UUID,
    current_user: AuthUser,
    google_creds: GoogleCreds,
    db: DB,
):
    service = CalendarService(db)
    event = await service.unlink_event_from_google(
        event_id=event_id,
        matter_id=matter_id,
        org_id=current_user.org_id,
        user_id=current_user.user_id,
        google_service=GoogleCalendarService(google_creds),
    )
    return CalendarEventResponse.model_validate(event)
