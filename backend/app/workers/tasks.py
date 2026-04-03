# backend/app/workers/tasks.py
import asyncio
import uuid
from app.workers.celery_app import celery_app


@celery_app.task(name="tasks.healthcheck")
def healthcheck() -> str:
    """Smoke-test task — verify Celery worker is running."""
    return "ok"


# ─── Phase 6: Drive webhook processing ───────────────────────────────────────

@celery_app.task(name="tasks.process_drive_change", bind=True, max_retries=3)
def process_drive_change(self, file_id: str, org_id: str) -> None:
    """
    Processes a Google Drive change notification.

    Flow:
    1. Get valid Google credentials for the org
    2. Call Drive Activity API to find out who changed the file and how
       (Drive API = file management; Drive Activity API = audit log)
    3. Look up the file_id in matter_documents — if not tracked, skip
    4. Write a document_edited activity log entry on the parent matter

    Retries up to 3 times with exponential backoff on transient failures.
    """
    asyncio.run(_process_drive_change(file_id=file_id, org_id=org_id, task=self))


async def _process_drive_change(file_id: str, org_id: str, task) -> None:
    from sqlalchemy import select
    from app.core.database import AsyncSessionLocal
    from app.services.google_auth_service import GoogleAuthService
    from app.services.google_drive_activity_service import GoogleDriveActivityService
    from app.services.document_service import DocumentService

    async with AsyncSessionLocal() as db:
        try:
            org_uuid = uuid.UUID(org_id)

            # 1. Get valid credentials (auto-refreshes if expired)
            auth_service = GoogleAuthService(db)
            credentials = await auth_service.get_valid_credentials(org_uuid)

            # 2. Fetch activity from the Drive Activity API
            #    NOTE: This is a SEPARATE API from the Drive API —
            #    different endpoint, different scope, different client
            activity_service = GoogleDriveActivityService(credentials)
            latest = await activity_service.get_latest_activity(file_id)

            if not latest:
                return  # No activity found — skip

            # 3. Find the document in our DB and write the log entry
            doc_service = DocumentService(db)
            tracked = await doc_service.log_external_edit(
                drive_file_id=file_id,
                org_id=org_uuid,
                editor_name=latest.get("editor_name"),
                change_type=latest.get("change_type", "unknown"),
                timestamp=latest.get("timestamp"),
            )

            if not tracked:
                pass  # File not linked to any matter — silently ignore

        except Exception as exc:
            # Retry with exponential backoff: 60s, 120s, 240s
            raise task.retry(exc=exc, countdown=60 * (2 ** task.request.retries))


# ─── Phase 6: Drive folder creation ──────────────────────────────────────────

@celery_app.task(name="tasks.create_drive_folder", bind=True, max_retries=3)
def create_drive_folder(self, matter_id: str, org_id: str) -> None:
    """
    Creates the Google Drive folder structure for a new matter and
    persists the folder ID and URL back to the matter record.

    Triggered automatically after matter creation (Phase 6).
    """
    asyncio.run(_create_drive_folder(matter_id=matter_id, org_id=org_id, task=self))


async def _create_drive_folder(matter_id: str, org_id: str, task) -> None:
    from sqlalchemy import select
    from app.core.database import AsyncSessionLocal
    from app.services.google_auth_service import GoogleAuthService
    from app.services.google_drive_service import GoogleDriveService
    from app.models.matter import Matter
    from app.models.client import Client

    async with AsyncSessionLocal() as db:
        try:
            matter_uuid = uuid.UUID(matter_id)
            org_uuid = uuid.UUID(org_id)

            # Fetch matter + client name
            matter_result = await db.execute(
                select(Matter).where(Matter.id == matter_uuid)
            )
            matter = matter_result.scalar_one_or_none()
            if not matter:
                return

            client_result = await db.execute(
                select(Client).where(Client.id == matter.client_id)
            )
            client = client_result.scalar_one_or_none()
            client_name = client.name if client else "Unknown Client"

            # Get credentials
            auth_service = GoogleAuthService(db)
            credentials = await auth_service.get_valid_credentials(org_uuid)

            drive_service = GoogleDriveService(db, credentials)
            folder_id, folder_url = await drive_service.create_matter_folder_structure(
                client_name=client_name,
                matter_title=matter.title,
                reference_no=matter.reference_no,
            )

            # Persist folder ID and URL back to the matter
            matter.drive_folder_id = folder_id
            matter.drive_folder_url = folder_url
            await db.commit()

        except Exception as exc:
            raise task.retry(exc=exc, countdown=60 * (2 ** task.request.retries))


# ─── Phase 6: Webhook channel renewal ────────────────────────────────────────

@celery_app.task(name="tasks.renew_expiring_webhook_channels")
def renew_expiring_webhook_channels() -> None:
    """
    Scheduled task (Celery beat) — runs daily.
    Finds all orgs whose Drive webhook channel expires within 24 hours
    and re-registers a fresh channel.

    Drive webhook channels expire after a maximum of 7 days.
    If the channel expires, edit tracking silently stops.
    """
    asyncio.run(_renew_expiring_channels())


async def _renew_expiring_channels() -> None:
    from datetime import datetime, timezone, timedelta
    from sqlalchemy import select
    from app.core.database import AsyncSessionLocal
    from app.services.google_auth_service import GoogleAuthService
    from app.services.google_drive_service import GoogleDriveService
    from app.models.organisation import Organisation

    renewal_threshold = datetime.now(timezone.utc) + timedelta(hours=24)

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Organisation).where(
                Organisation.drive_webhook_channel_id.isnot(None),
                Organisation.drive_webhook_expires_at <= renewal_threshold,
                Organisation.google_refresh_token.isnot(None),
            )
        )
        orgs = result.scalars().all()

        for org in orgs:
            try:
                auth_service = GoogleAuthService(db)
                credentials = await auth_service.get_valid_credentials(org.id)
                drive_service = GoogleDriveService(db, credentials)
                channel = await drive_service.register_webhook_channel(org.id)

                expires_at = datetime.fromtimestamp(
                    int(channel["expiration"]) / 1000, tz=timezone.utc
                )
                await drive_service.persist_webhook_channel(
                    org_id=org.id,
                    channel_id=channel["id"],
                    expires_at=expires_at,
                )
            except Exception:
                pass  # Log and continue — don't let one failure block others