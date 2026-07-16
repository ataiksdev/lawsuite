# backend/app/api/matters.py
import math
import uuid

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.core.deps import ScopedDB, AuthUser, MemberUser, GoogleCreds
from app.models.matter import MatterStatus
from app.models.matter_document import MatterEmail
from app.schemas.matter import (
    ActivityLogResponse,
    DriveFolderInfo,
    EmailLinkRequest,
    LinkDriveFolderRequest,
    MatterCreate,
    MatterListResponse,
    MatterResponse,
    MatterUpdate,
    StatusUpdate,
)
from app.services.activity_service import ActivityService
from app.services.billing_service import BillingService
from app.services.gmail_service import GmailService
from app.services.matter_service import MatterService

router = APIRouter()


@router.get("/", response_model=MatterListResponse)
async def list_matters(
    current_user: AuthUser,
    db: ScopedDB,
    status: MatterStatus | None = Query(None),
    client_id: uuid.UUID | None = Query(None),
    assigned_to: uuid.UUID | None = Query(None),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
):
    """
    List matters for the current organisation.
    Supports filtering by status, client, assignee, and keyword search.
    """
    service = MatterService(db)
    matters, total = await service.list_matters(
        org_id=current_user.org_id,
        status_filter=status,
        client_id=client_id,
        assigned_to=assigned_to,
        search=search,
        page=page,
        page_size=page_size,
    )
    return MatterListResponse(
        items=[MatterResponse.model_validate(m) for m in matters],
        total=total,
        page=page,
        page_size=page_size,
        pages=math.ceil(total / page_size) if total else 0,
    )


@router.post("/", response_model=MatterResponse, status_code=status.HTTP_201_CREATED)
async def create_matter(payload: MatterCreate, current_user: MemberUser, db: ScopedDB):
    """
    Create a new matter. Automatically generates a reference number (MAT-YYYY-XXXX).
    Status starts at 'intake'.
    """
    service = MatterService(db)
    matter = await service.create_matter(
        org_id=current_user.org_id,
        user_id=current_user.user_id,
        data=payload,
    )
    return MatterResponse.model_validate(matter)


@router.get("/{matter_id}", response_model=MatterResponse)
async def get_matter(matter_id: uuid.UUID, current_user: AuthUser, db: ScopedDB):
    """Get a single matter with its client details."""
    service = MatterService(db)
    matter = await service.get_matter(matter_id, current_user.org_id)
    return MatterResponse.model_validate(matter)


@router.patch("/{matter_id}", response_model=MatterResponse)
async def update_matter(
    matter_id: uuid.UUID,
    payload: MatterUpdate,
    current_user: MemberUser,
    db: ScopedDB,
):
    """Update matter fields. Logs a matter_updated activity entry."""
    service = MatterService(db)
    matter = await service.update_matter(
        matter_id=matter_id,
        org_id=current_user.org_id,
        user_id=current_user.user_id,
        data=payload,
    )
    return MatterResponse.model_validate(matter)


@router.patch("/{matter_id}/status", response_model=MatterResponse)
async def change_status(
    matter_id: uuid.UUID,
    payload: StatusUpdate,
    current_user: MemberUser,
    db: ScopedDB,
):
    """
    Move a matter to a new stage.
    Invalid transitions (e.g. archived → in_review) are rejected with 422.
    """
    service = MatterService(db)
    matter = await service.change_status(
        matter_id=matter_id,
        org_id=current_user.org_id,
        user_id=current_user.user_id,
        data=payload,
    )
    return MatterResponse.model_validate(matter)


@router.delete("/{matter_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_matter(matter_id: uuid.UUID, current_user: MemberUser, db: ScopedDB):
    """
    Permanently delete a matter. Matter must be archived first.
    This also deletes all tasks, documents, and activity logs.
    """
    service = MatterService(db)
    await service.delete_matter(
        matter_id=matter_id,
        org_id=current_user.org_id,
        user_id=current_user.user_id,
    )


@router.get("/{matter_id}/activity", response_model=dict)
async def get_activity(
    matter_id: uuid.UUID,
    current_user: AuthUser,
    db: ScopedDB,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
):
    """
    Paginated activity log for a matter.
    Returns newest events first.
    """
    # Verify matter belongs to this org first
    matter_service = MatterService(db)
    await matter_service.get_matter(matter_id, current_user.org_id)

    activity_service = ActivityService(db)
    logs, total = await activity_service.get_for_matter(
        matter_id=matter_id,
        org_id=current_user.org_id,
        page=page,
        page_size=page_size,
    )
    return {
        "items": [ActivityLogResponse.model_validate(log) for log in logs],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": math.ceil(total / page_size) if total else 0,
    }


# ─── Drive folder linking ─────────────────────────────────────────────────────


@router.post(
    "/{matter_id}/drive-folder",
    response_model=DriveFolderInfo,
    status_code=status.HTTP_200_OK,
)
async def link_drive_folder(
    matter_id: uuid.UUID,
    payload: LinkDriveFolderRequest,
    current_user: MemberUser,
    google_creds: GoogleCreds,
    db: ScopedDB,
):
    """
    Link a Google Drive folder to a matter and optionally auto-import
    every file inside it as a document record.

    Accepts either a bare folder ID or any common shareable URL:
      https://drive.google.com/drive/folders/{id}
      https://drive.google.com/drive/u/0/folders/{id}

    If import_existing=true (default), every non-folder file currently
    in the Drive folder is imported as a new MatterDocument.
    Files already linked (matched by drive_file_id) are skipped.
    """
    from app.services.google_drive_service import GoogleDriveService

    await BillingService(db).check_feature_access(current_user.org_id, "drive_integration")

    raw = payload.folder_id or payload.folder_url
    if not raw:
        raise HTTPException(
            status_code=400,
            detail="Provide either folder_id or folder_url.",
        )

    drive_service = GoogleDriveService(db, google_creds)
    matter_service = MatterService(db)

    return await matter_service.link_drive_folder(
        matter_id=matter_id,
        org_id=current_user.org_id,
        user_id=current_user.user_id,
        folder_id_or_url=raw,
        import_existing=payload.import_existing,
        drive_service=drive_service,
    )


@router.post(
    "/{matter_id}/drive-folder/sync",
    response_model=dict,
    status_code=status.HTTP_200_OK,
)
async def sync_drive_folder(
    matter_id: uuid.UUID,
    current_user: MemberUser,
    google_creds: GoogleCreds,
    db: ScopedDB,
):
    """
    Re-scan the matter's linked Drive folder and import any new files
    not yet recorded as documents. Returns {file_count, imported_count}.
    """
    from app.services.google_drive_service import GoogleDriveService

    await BillingService(db).check_feature_access(current_user.org_id, "drive_integration")

    drive_service = GoogleDriveService(db, google_creds)
    matter_service = MatterService(db)

    return await matter_service.sync_drive_folder(
        matter_id=matter_id,
        org_id=current_user.org_id,
        user_id=current_user.user_id,
        drive_service=drive_service,
    )


@router.post(
    "/{matter_id}/drive-folder/create",
    response_model=DriveFolderInfo,
    status_code=status.HTTP_201_CREATED,
)
async def create_drive_folder(
    matter_id: uuid.UUID,
    current_user: MemberUser,
    google_creds: GoogleCreds,
    db: ScopedDB,
):
    """
    Create a new Google Drive folder for this matter and link it instantly.
    The folder will be named "{reference_no} — {title}" and placed within
    the client's folder (auto-created if missing).
    """
    from app.services.google_drive_service import GoogleDriveService

    await BillingService(db).check_feature_access(current_user.org_id, "drive_integration")

    drive_service = GoogleDriveService(db, google_creds)
    matter_service = MatterService(db)

    return await matter_service.create_drive_folder(
        matter_id=matter_id,
        org_id=current_user.org_id,
        user_id=current_user.user_id,
        drive_service=drive_service,
    )


# ─── Phase 8: Gmail thread linking ────────────────────────────────────────────


@router.post("/{matter_id}/emails", response_model=dict, status_code=status.HTTP_201_CREATED)
async def link_email_thread(
    matter_id: uuid.UUID,
    payload: "EmailLinkRequest",
    current_user: MemberUser,
    google_creds: "GoogleCreds",
    db: ScopedDB,
):
    """
    Link a Gmail thread to a matter.
    Fetches thread subject + snippet from Gmail API and stores the reference.
    Logs an email_linked activity entry.
    """

    await BillingService(db).check_feature_access(current_user.org_id, "drive_integration")

    # Verify matter belongs to org
    matter_service = MatterService(db)
    await matter_service.get_matter(matter_id, current_user.org_id)

    # Fetch thread metadata from Gmail
    gmail = GmailService(google_creds)
    thread_data = await gmail.get_thread(payload.gmail_thread_id)

    # Check not already linked
    existing = await db.execute(
        select(MatterEmail).where(
            MatterEmail.matter_id == matter_id,
            MatterEmail.gmail_thread_id == payload.gmail_thread_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Thread already linked to this matter")

    email_link = MatterEmail(
        matter_id=matter_id,
        organisation_id=current_user.org_id,
        linked_by=current_user.user_id,
        gmail_thread_id=payload.gmail_thread_id,
        subject=thread_data.get("subject"),
        snippet=thread_data.get("snippet"),
    )
    db.add(email_link)

    activity = ActivityService(db)
    await activity.log(
        matter_id=matter_id,
        org_id=current_user.org_id,
        actor_id=current_user.user_id,
        event_type="email_linked",
        payload={
            "thread_id": payload.gmail_thread_id,
            "subject": thread_data.get("subject"),
        },
    )

    await db.commit()
    await db.refresh(email_link)

    return {
        "id": str(email_link.id),
        "gmail_thread_id": email_link.gmail_thread_id,
        "subject": email_link.subject,
        "snippet": email_link.snippet,
        "linked_at": email_link.linked_at.isoformat(),
    }


@router.get("/{matter_id}/emails", response_model=list[dict])
async def list_linked_emails(matter_id: uuid.UUID, current_user: AuthUser, db: ScopedDB):
    """List all Gmail threads linked to a matter."""
    await BillingService(db).check_feature_access(current_user.org_id, "drive_integration")

    matter_service = MatterService(db)
    await matter_service.get_matter(matter_id, current_user.org_id)

    result = await db.execute(
        select(MatterEmail)
        .where(
            MatterEmail.matter_id == matter_id,
            MatterEmail.organisation_id == current_user.org_id,
        )
        .order_by(MatterEmail.linked_at.desc())
    )
    emails = result.scalars().all()

    return [
        {
            "id": str(e.id),
            "gmail_thread_id": e.gmail_thread_id,
            "subject": e.subject,
            "snippet": e.snippet,
            "linked_at": e.linked_at.isoformat(),
        }
        for e in emails
    ]


@router.delete("/{matter_id}/emails/{email_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_email_thread(
    matter_id: uuid.UUID,
    email_id: uuid.UUID,
    current_user: MemberUser,
    db: ScopedDB,
):
    """Unlink a Gmail thread from a matter."""
    result = await db.execute(
        select(MatterEmail).where(
            MatterEmail.id == email_id,
            MatterEmail.matter_id == matter_id,
            MatterEmail.organisation_id == current_user.org_id,
        )
    )
    email_link = result.scalar_one_or_none()
    if not email_link:
        raise HTTPException(status_code=404, detail="Linked email not found")

    await db.delete(email_link)
    await db.commit()


@router.get("/{matter_id}/inbox", response_model=list[dict])
async def list_recent_inbox(
    matter_id: uuid.UUID,
    current_user: AuthUser,
    google_creds: "GoogleCreds",
    db: ScopedDB,
    search: str | None = None,
):
    """
    List recent Gmail threads that can be linked to this matter.
    Optionally filter by search query (Gmail query syntax).
    Requires Google Workspace to be connected.
    """

    await BillingService(db).check_feature_access(current_user.org_id, "drive_integration")

    matter_service = MatterService(db)
    await matter_service.get_matter(matter_id, current_user.org_id)

    gmail = GmailService(google_creds)
    if search:
        return await gmail.search_threads(search)
    return await gmail.list_recent_threads()
