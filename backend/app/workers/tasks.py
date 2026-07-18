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
    from app.core.database import worker_session
    from app.services.document_service import DocumentService
    from app.services.google_auth_service import GoogleAuthService
    from app.services.google_drive_activity_service import GoogleDriveActivityService

    async with worker_session() as db:
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
            raise task.retry(exc=exc, countdown=60 * (2**task.request.retries))


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

    from app.core.database import worker_session
    from app.models.client import Client
    from app.models.matter import Matter
    from app.services.google_auth_service import GoogleAuthService
    from app.services.google_drive_service import GoogleDriveService

    async with worker_session() as db:
        try:
            matter_uuid = uuid.UUID(matter_id)
            org_uuid = uuid.UUID(org_id)

            # Fetch matter + client name
            matter_result = await db.execute(select(Matter).where(Matter.id == matter_uuid))
            matter = matter_result.scalar_one_or_none()
            if not matter:
                return

            client_result = await db.execute(select(Client).where(Client.id == matter.client_id))
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
            raise task.retry(exc=exc, countdown=60 * (2**task.request.retries))


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
    from datetime import datetime, timedelta, timezone

    from sqlalchemy import select

    from app.core.database import worker_session
    from app.models.organisation import Organisation
    from app.services.google_auth_service import GoogleAuthService
    from app.services.google_drive_service import GoogleDriveService

    renewal_threshold = datetime.now(timezone.utc) + timedelta(hours=24)

    async with worker_session() as db:
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

                expires_at = datetime.fromtimestamp(int(channel["expiration"]) / 1000, tz=timezone.utc)
                await drive_service.persist_webhook_channel(
                    org_id=org.id,
                    channel_id=channel["id"],
                    expires_at=expires_at,
                )
            except Exception:
                pass  # Log and continue — don't let one failure block others


# ─── Task due-soon reminders ──────────────────────────────────────────────────


@celery_app.task(name="tasks.send_task_due_soon_emails")
def send_task_due_soon_emails() -> None:
    """Scheduled task (Celery beat) — runs daily, emails assignees of tasks due soon."""
    asyncio.run(_send_task_due_soon_emails())


async def _send_task_due_soon_emails() -> None:
    from sqlalchemy import select

    from app.core.config import settings
    from app.core.database import worker_session
    from app.models.organisation import Organisation
    from app.models.user import User
    from app.services import email_service
    from app.services.notification_preferences import should_send
    from app.services.task_service import TaskService

    async with worker_session() as db:
        orgs = (
            await db.execute(select(Organisation).where(Organisation.is_active == True))
        ).scalars().all()

        for org in orgs:
            try:
                rows, _ = await TaskService(db).get_due_soon(org.id, days=3, page=1, page_size=500)
                if not rows:
                    continue

                assignee_ids = {row["assigned_to"] for row in rows if row["assigned_to"]}
                if not assignee_ids:
                    continue
                users = (
                    await db.execute(select(User).where(User.id.in_(assignee_ids)))
                ).scalars().all()
                users_by_id = {user.id: user for user in users}

                for row in rows:
                    try:
                        user = users_by_id.get(row["assigned_to"])
                        if not user or not should_send(user, "task_due_soon"):
                            continue
                        await email_service.send_task_due_soon_email(
                            to=user.email,
                            name=user.full_name,
                            task_title=row["title"],
                            matter_title=row["matter_title"],
                            matter_ref=row["matter_reference_no"],
                            due_date=row["due_date"].isoformat(),
                            priority=row["priority"],
                            matter_url=f"{settings.frontend_url}/#/matters/{row['matter_id']}",
                        )
                    except Exception:
                        pass
            except Exception:
                pass  # One org's failure shouldn't block the others


# ─── Weekly digest ─────────────────────────────────────────────────────────────


@celery_app.task(name="tasks.send_weekly_digest_emails")
def send_weekly_digest_emails() -> None:
    """Scheduled task (Celery beat) — runs weekly, emails each user their overdue + due-soon tasks."""
    asyncio.run(_send_weekly_digest_emails())


async def _send_weekly_digest_emails() -> None:
    from sqlalchemy import select

    from app.core.config import settings
    from app.core.database import worker_session
    from app.models.organisation import Organisation
    from app.models.user import User
    from app.services import email_service
    from app.services.notification_preferences import should_send
    from app.services.task_service import TaskService

    async with worker_session() as db:
        orgs = (
            await db.execute(select(Organisation).where(Organisation.is_active == True))
        ).scalars().all()

        for org in orgs:
            try:
                overdue_rows, _ = await TaskService(db).get_overdue(org.id, page=1, page_size=500)
                due_soon_rows, _ = await TaskService(db).get_due_soon(org.id, days=7, page=1, page_size=500)
                if not overdue_rows and not due_soon_rows:
                    continue

                by_user: dict = {}
                for row in overdue_rows:
                    if row["assigned_to"]:
                        by_user.setdefault(row["assigned_to"], {"overdue": [], "due_soon": []})["overdue"].append(row)
                for row in due_soon_rows:
                    if row["assigned_to"]:
                        by_user.setdefault(row["assigned_to"], {"overdue": [], "due_soon": []})["due_soon"].append(row)
                if not by_user:
                    continue

                users = (
                    await db.execute(select(User).where(User.id.in_(by_user.keys())))
                ).scalars().all()

                for user in users:
                    try:
                        if not should_send(user, "weekly_digest"):
                            continue
                        tasks = by_user[user.id]
                        await email_service.send_weekly_digest_email(
                            to=user.email,
                            name=user.full_name,
                            overdue=tasks["overdue"],
                            due_soon=tasks["due_soon"],
                            tasks_url=f"{settings.frontend_url}/#/tasks",
                        )
                    except Exception:
                        pass
            except Exception:
                pass  # One org's failure shouldn't block the others
