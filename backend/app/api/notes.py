# backend/app/api/notes.py
"""
Standalone Notes API — /notes

Notes are first-class objects. matter_id and event_id are optional filters /
payload fields; they do not appear in the URL path.

Routes:
  GET    /notes                         — list (filterable by matter_id, event_id)
  POST   /notes                         — create (matter_id optional)
  GET    /notes/{note_id}               — get one
  PATCH  /notes/{note_id}               — update
  DELETE /notes/{note_id}               — delete
  POST   /notes/{note_id}/add-comment   — append task comment to note body
"""
import uuid

from fastapi import APIRouter, Query, status

from app.core.deps import DB, AuthUser
from app.schemas.note import AddCommentToNoteRequest, NoteCreate, NoteResponse, NoteUpdate
from app.services.note_service import NoteService

router = APIRouter()


@router.get("", response_model=list[NoteResponse])
async def list_notes(
    current_user: AuthUser,
    db: DB,
    matter_id: uuid.UUID | None = Query(None),
    event_id: uuid.UUID | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    """
    List notes for the current org, newest first.
    Optionally filter by matter_id and/or event_id.
    """
    service = NoteService(db)
    notes = await service.list_notes(
        org_id=current_user.org_id,
        matter_id=matter_id,
        event_id=event_id,
        limit=limit,
    )
    return [NoteResponse.model_validate(note) for note in notes]


@router.post("", response_model=NoteResponse, status_code=status.HTTP_201_CREATED)
async def create_note(
    payload: NoteCreate,
    current_user: AuthUser,
    db: DB,
):
    """
    Create a note. matter_id and event_id are optional.
    Must include at least body or svg_content.
    """
    service = NoteService(db)
    note = await service.create_note(
        org_id=current_user.org_id,
        user_id=current_user.user_id,
        data=payload,
    )
    return NoteResponse.model_validate(note)


@router.get("/{note_id}", response_model=NoteResponse)
async def get_note(
    note_id: uuid.UUID,
    current_user: AuthUser,
    db: DB,
):
    """Fetch a single note by ID."""
    service = NoteService(db)
    # Re-use internal helper via a list of one
    from sqlalchemy import select
    from app.models.note import Note
    result = await db.execute(
        select(Note).where(Note.id == note_id, Note.organisation_id == current_user.org_id)
    )
    note = result.scalar_one_or_none()
    if not note:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Note not found")
    return NoteResponse.model_validate(note)


@router.patch("/{note_id}", response_model=NoteResponse)
async def update_note(
    note_id: uuid.UUID,
    payload: NoteUpdate,
    current_user: AuthUser,
    db: DB,
):
    """Update a note. All fields optional. Passing matter_id=null unlinks from matter."""
    service = NoteService(db)
    note = await service.update_note(
        note_id=note_id,
        org_id=current_user.org_id,
        user_id=current_user.user_id,
        data=payload,
    )
    return NoteResponse.model_validate(note)


@router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_note(
    note_id: uuid.UUID,
    current_user: AuthUser,
    db: DB,
):
    """Delete a note."""
    service = NoteService(db)
    await service.delete_note(note_id=note_id, org_id=current_user.org_id)


@router.post("/{note_id}/add-comment", response_model=NoteResponse)
async def add_comment_to_note(
    note_id: uuid.UUID,
    payload: AddCommentToNoteRequest,
    current_user: AuthUser,
    db: DB,
):
    """
    Append a task comment's text to a note's body.

    Rules:
    - The comment must belong to the same organisation.
    - If the note is linked to a matter, the comment's task must belong to
      that same matter (enforced by NoteService).
    - Standalone notes (no matter_id) accept comments from any task in the org.
    """
    service = NoteService(db)
    note = await service.add_comment_to_note(
        note_id=note_id,
        task_id=payload.task_id,
        comment_id=payload.comment_id,
        org_id=current_user.org_id,
    )
    return NoteResponse.model_validate(note)
