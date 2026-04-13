import uuid
from datetime import datetime

from fastapi import APIRouter, Query, status

from app.core.deps import DB, AuthUser, GoogleCreds
from app.schemas.calendar import (
    AddCommentToNoteRequest,
    CalendarEventCreate,
    CalendarEventListResponse,
    CalendarEventResponse,
    CalendarEventUpdate,
    MatterNoteCreate,
    MatterNoteResponse,
    MatterNoteUpdate,
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


@router.get("/notes/recent", response_model=list[MatterNoteResponse])
async def recent_notes(
    current_user: AuthUser,
    db: DB,
    limit: int = Query(20, ge=1, le=100),
):
    service = CalendarService(db)
    notes = await service.recent_notes(current_user.org_id, limit=limit)
    return [MatterNoteResponse.model_validate(note) for note in notes]


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


@router.get("/matters/{matter_id}/notes", response_model=list[MatterNoteResponse])
async def list_notes(
    matter_id: uuid.UUID,
    current_user: AuthUser,
    db: DB,
    event_id: uuid.UUID | None = Query(None),
):
    service = CalendarService(db)
    notes = await service.list_notes(matter_id, current_user.org_id, event_id=event_id)
    return [MatterNoteResponse.model_validate(note) for note in notes]


@router.post("/matters/{matter_id}/notes", response_model=MatterNoteResponse, status_code=status.HTTP_201_CREATED)
async def create_note(
    matter_id: uuid.UUID,
    payload: MatterNoteCreate,
    current_user: AuthUser,
    db: DB,
):
    service = CalendarService(db)
    note = await service.create_note(
        matter_id=matter_id,
        org_id=current_user.org_id,
        user_id=current_user.user_id,
        data=payload,
    )
    return MatterNoteResponse.model_validate(note)


@router.patch("/matters/{matter_id}/notes/{note_id}", response_model=MatterNoteResponse)
async def update_note(
    matter_id: uuid.UUID,
    note_id: uuid.UUID,
    payload: MatterNoteUpdate,
    current_user: AuthUser,
    db: DB,
):
    service = CalendarService(db)
    note = await service.update_note(
        note_id=note_id,
        matter_id=matter_id,
        org_id=current_user.org_id,
        user_id=current_user.user_id,
        data=payload,
    )
    return MatterNoteResponse.model_validate(note)


@router.delete("/matters/{matter_id}/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_note(
    matter_id: uuid.UUID,
    note_id: uuid.UUID,
    current_user: AuthUser,
    db: DB,
):
    service = CalendarService(db)
    await service.delete_note(
        note_id=note_id,
        matter_id=matter_id,
        org_id=current_user.org_id,
        user_id=current_user.user_id,
    )


@router.post(
    "/matters/{matter_id}/tasks/{task_id}/comments/{comment_id}/add-to-note",
    response_model=MatterNoteResponse,
)
async def add_comment_to_note(
    matter_id: uuid.UUID,
    task_id: uuid.UUID,
    comment_id: uuid.UUID,
    payload: AddCommentToNoteRequest,
    current_user: AuthUser,
    db: DB,
):
    service = CalendarService(db)
    note = await service.add_comment_to_note(
        task_id=task_id,
        comment_id=comment_id,
        matter_id=matter_id,
        note_id=payload.note_id,
        org_id=current_user.org_id,
        user_id=current_user.user_id,
    )
    return MatterNoteResponse.model_validate(note)
