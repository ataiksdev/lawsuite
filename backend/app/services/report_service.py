# backend/app/services/report_service.py
import uuid
from datetime import datetime, date, timedelta, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from fastapi import HTTPException, status

from app.models.activity_log import ActivityLog
from app.models.matter import Matter, MatterStatus
from app.models.client import Client
from app.models.task import Task, TaskStatus
from app.models.matter_document import MatterDocument, DocumentStatus
from app.models.organisation import Organisation
from app.models.report import Report
from app.schemas.report import (
    ReportGenerateRequest,
    ReportData,
    ClientActivity,
    MatterActivity,
    TaskSummary,
    DocumentSummary,
)


def _resolve_period(
    req: ReportGenerateRequest,
) -> tuple[date, date, str]:
    """
    Resolve date_from, date_to, and a human-readable period label
    from the report request.
    """
    today = date.today()

    if req.period_type == "weekly":
        # Last 7 complete days
        date_to = today - timedelta(days=1)
        date_from = date_to - timedelta(days=6)
        label = f"Week of {date_from.strftime('%d %b %Y')} – {date_to.strftime('%d %b %Y')}"

    elif req.period_type == "monthly":
        # Previous calendar month
        first_of_this_month = today.replace(day=1)
        date_to = first_of_this_month - timedelta(days=1)
        date_from = date_to.replace(day=1)
        label = date_from.strftime("%B %Y")

    else:  # custom
        if not req.date_from or not req.date_to:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="date_from and date_to are required for custom period",
            )
        if req.date_from > req.date_to:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="date_from must be before date_to",
            )
        date_from = req.date_from
        date_to = req.date_to
        label = f"{date_from.strftime('%d %b')} – {date_to.strftime('%d %b %Y')}"

    return date_from, date_to, label


class ReportService:

    def __init__(self, db: AsyncSession):
        self.db = db

    # ── Core aggregation ──────────────────────────────────────────────────

    async def aggregate(
        self,
        org_id: uuid.UUID,
        date_from: date,
        date_to: date,
    ) -> ReportData:
        """
        Query the activity_log and related tables to build the full
        report data structure.  All queries are scoped to org_id.
        """
        # Convert dates to timezone-aware datetimes for comparison
        dt_from = datetime.combine(date_from, datetime.min.time()).replace(tzinfo=timezone.utc)
        dt_to = datetime.combine(date_to, datetime.max.time()).replace(tzinfo=timezone.utc)

        # ── Org name ──────────────────────────────────────────────────────
        org_result = await self.db.execute(
            select(Organisation).where(Organisation.id == org_id)
        )
        org = org_result.scalar_one()

        # ── All activity in period ─────────────────────────────────────────
        activity_result = await self.db.execute(
            select(ActivityLog).where(
                ActivityLog.organisation_id == org_id,
                ActivityLog.created_at >= dt_from,
                ActivityLog.created_at <= dt_to,
            ).order_by(ActivityLog.created_at)
        )
        all_logs = activity_result.scalars().all()
        total_events = len(all_logs)

        # Index logs by matter_id for efficient per-matter grouping
        logs_by_matter: dict[uuid.UUID, list[ActivityLog]] = {}
        for log in all_logs:
            logs_by_matter.setdefault(log.matter_id, []).append(log)

        # ── All matters active in period ───────────────────────────────────
        # A matter is "active" if it was open at any point during the period
        matters_result = await self.db.execute(
            select(Matter).where(
                Matter.organisation_id == org_id,
                Matter.status != MatterStatus.archived,
            )
        )
        all_matters = matters_result.scalars().all()

        # Count opened/closed during period
        matters_opened = sum(
            1 for m in all_matters
            if m.opened_at and dt_from <= m.opened_at.replace(tzinfo=timezone.utc) <= dt_to
        )
        matters_closed = sum(
            1 for m in all_matters
            if m.closed_at and dt_from <= m.closed_at.replace(tzinfo=timezone.utc) <= dt_to
        )

        # ── Build per-client structure ─────────────────────────────────────
        matters_by_client: dict[uuid.UUID, list[Matter]] = {}
        for matter in all_matters:
            matters_by_client.setdefault(matter.client_id, []).append(matter)

        client_activities: list[ClientActivity] = []

        for client_id, matters in matters_by_client.items():
            # Fetch client
            cl_result = await self.db.execute(
                select(Client).where(Client.id == client_id)
            )
            client = cl_result.scalar_one_or_none()
            if not client:
                continue

            matter_activities: list[MatterActivity] = []

            for matter in matters:
                matter_logs = logs_by_matter.get(matter.id, [])

                # Count events by type
                events_by_type: dict[str, int] = {}
                for log in matter_logs:
                    events_by_type[log.event_type] = (
                        events_by_type.get(log.event_type, 0) + 1
                    )

                # Task summary for this matter
                task_summary = await self._task_summary(matter.id, dt_to)

                # Document summary for this matter
                doc_summary = await self._document_summary(matter.id, dt_from, dt_to)

                matter_activities.append(
                    MatterActivity(
                        matter_id=matter.id,
                        matter_title=matter.title,
                        reference_no=matter.reference_no,
                        status=matter.status.value,
                        event_count=len(matter_logs),
                        events_by_type=events_by_type,
                        tasks=task_summary,
                        documents=doc_summary,
                    )
                )

            # Sort matters by event count descending
            matter_activities.sort(key=lambda m: m.event_count, reverse=True)

            client_activities.append(
                ClientActivity(
                    client_id=client.id,
                    client_name=client.name,
                    matter_count=len(matters),
                    matters=matter_activities,
                )
            )

        # Sort clients by total event count
        client_activities.sort(
            key=lambda c: sum(m.event_count for m in c.matters),
            reverse=True,
        )

        return ReportData(
            org_id=org_id,
            org_name=org.name,
            period_label="",  # filled by caller
            date_from=date_from,
            date_to=date_to,
            generated_at=datetime.now(timezone.utc),
            total_events=total_events,
            matters_active=len(all_matters),
            matters_opened=matters_opened,
            matters_closed=matters_closed,
            clients=client_activities,
        )

    async def _task_summary(
        self, matter_id: uuid.UUID, as_of: datetime
    ) -> TaskSummary:
        result = await self.db.execute(
            select(Task).where(
                Task.matter_id == matter_id,
                Task.is_deleted == False,
            )
        )
        tasks = result.scalars().all()
        today = date.today()
        return TaskSummary(
            total=len(tasks),
            completed=sum(1 for t in tasks if t.status == TaskStatus.done),
            overdue=sum(
                1 for t in tasks
                if t.due_date and t.due_date < today
                and t.status not in (TaskStatus.done, TaskStatus.cancelled)
            ),
        )

    async def _document_summary(
        self, matter_id: uuid.UUID, dt_from: datetime, dt_to: datetime
    ) -> DocumentSummary:
        result = await self.db.execute(
            select(MatterDocument).where(
                MatterDocument.matter_id == matter_id,
                MatterDocument.is_deleted == False,
            )
        )
        docs = result.scalars().all()
        added_in_period = sum(
            1 for d in docs
            if dt_from <= d.added_at.replace(tzinfo=timezone.utc) <= dt_to
        )
        versioned = sum(1 for d in docs if d.current_version > 1)
        signed = sum(1 for d in docs if d.status == DocumentStatus.signed)
        return DocumentSummary(
            added=added_in_period,
            versioned=versioned,
            signed=signed,
        )

    # ── Google Doc export ─────────────────────────────────────────────────

    async def export_to_doc(
        self,
        data: ReportData,
        org_id: uuid.UUID,
        credentials,
    ) -> tuple[str, str]:
        """
        Build the report as a Google Doc and return (file_id, drive_url).
        Uses Docs API batchUpdate to write formatted content.
        """
        from googleapiclient.discovery import build

        drive = build("drive", "v3", credentials=credentials)
        docs = build("docs", "v1", credentials=credentials)

        # Create a blank Google Doc
        title = f"LegalOps Report — {data.period_label}"
        doc = drive.files().create(
            body={
                "name": title,
                "mimeType": "application/vnd.google-apps.document",
            },
            fields="id,webViewLink",
        ).execute()

        file_id = doc["id"]
        drive_url = doc.get("webViewLink", "")

        # Build document content as a sequence of batchUpdate requests
        requests = _build_doc_requests(data)

        if requests:
            docs.documents().batchUpdate(
                documentId=file_id,
                body={"requests": requests},
            ).execute()

        return file_id, drive_url

    # ── Persist and retrieve reports ──────────────────────────────────────

    async def save_report(
        self,
        org_id: uuid.UUID,
        user_id: uuid.UUID | None,
        title: str,
        period_label: str,
        date_from: date,
        date_to: date,
        drive_file_id: str | None,
        drive_url: str | None,
    ) -> Report:
        report = Report(
            organisation_id=org_id,
            created_by=user_id,
            title=title,
            period_label=period_label,
            date_from=date_from,
            date_to=date_to,
            drive_file_id=drive_file_id,
            drive_url=drive_url,
        )
        self.db.add(report)
        await self.db.commit()
        await self.db.refresh(report)
        return report

    async def list_reports(
        self,
        org_id: uuid.UUID,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[Report], int]:
        count_result = await self.db.execute(
            select(func.count()).select_from(Report).where(
                Report.organisation_id == org_id
            )
        )
        total = count_result.scalar_one()

        result = await self.db.execute(
            select(Report)
            .where(Report.organisation_id == org_id)
            .order_by(Report.generated_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return list(result.scalars().all()), total

    # ── Full generate pipeline ────────────────────────────────────────────

    async def generate(
        self,
        org_id: uuid.UUID,
        user_id: uuid.UUID | None,
        req: ReportGenerateRequest,
        credentials=None,
    ) -> tuple[ReportData, Report]:
        """
        Full report pipeline:
        1. Resolve the period
        2. Aggregate activity data from the DB
        3. Optionally export to Google Doc
        4. Optionally send email
        5. Persist the report record
        6. Return report data + persisted record
        """
        date_from, date_to, period_label = _resolve_period(req)

        data = await self.aggregate(org_id, date_from, date_to)
        data.period_label = period_label

        drive_file_id = None
        drive_url = None

        if req.export_to_drive and credentials:
            drive_file_id, drive_url = await self.export_to_doc(
                data=data,
                org_id=org_id,
                credentials=credentials,
            )

        if req.send_email and req.recipient_email and drive_url and credentials:
            from app.services.gmail_service import GmailService
            gmail = GmailService(credentials)
            await gmail.send_report_email(
                recipient=req.recipient_email,
                report_title=f"{data.org_name} Activity Report",
                doc_url=drive_url,
                period=period_label,
            )

        title = f"{data.org_name} — {period_label}"
        report = await self.save_report(
            org_id=org_id,
            user_id=user_id,
            title=title,
            period_label=period_label,
            date_from=date_from,
            date_to=date_to,
            drive_file_id=drive_file_id,
            drive_url=drive_url,
        )

        return data, report


# ── Doc content builder ───────────────────────────────────────────────────────

def _build_doc_requests(data: ReportData) -> list[dict]:
    """
    Build a sequence of Docs API batchUpdate insertText requests
    that populate the report document.

    The Docs API inserts text at a given index. We build the content
    as a plain string first then convert to insert requests.
    Since we're inserting at index 1 (after the document title),
    we build the body text in reverse order.
    """
    lines = []

    lines.append(f"LegalOps Activity Report — {data.period_label}\n")
    lines.append(f"Organisation: {data.org_name}\n")
    lines.append(f"Period: {data.date_from.strftime('%d %b %Y')} to {data.date_to.strftime('%d %b %Y')}\n")
    lines.append(f"Generated: {data.generated_at.strftime('%d %b %Y %H:%M UTC')}\n")
    lines.append("\n")

    lines.append("SUMMARY\n")
    lines.append(f"Total activity events:  {data.total_events}\n")
    lines.append(f"Active matters:         {data.matters_active}\n")
    lines.append(f"Matters opened:         {data.matters_opened}\n")
    lines.append(f"Matters closed:         {data.matters_closed}\n")
    lines.append("\n")

    for client in data.clients:
        lines.append(f"CLIENT: {client.client_name}\n")
        lines.append(f"Matters: {client.matter_count}\n")
        lines.append("\n")

        for matter in client.matters:
            lines.append(f"  {matter.reference_no} — {matter.matter_title}\n")
            lines.append(f"  Status: {matter.status.replace('_', ' ').title()}\n")
            lines.append(f"  Events this period: {matter.event_count}\n")

            if matter.events_by_type:
                for event_type, count in sorted(matter.events_by_type.items()):
                    readable = event_type.replace("_", " ").title()
                    lines.append(f"    - {readable}: {count}\n")

            t = matter.tasks
            lines.append(
                f"  Tasks: {t.total} total, {t.completed} completed, {t.overdue} overdue\n"
            )
            d = matter.documents
            lines.append(
                f"  Documents: {d.added} added, {d.signed} signed\n"
            )
            lines.append("\n")

        lines.append("\n")

    full_text = "".join(lines)

    # Single insertText request — insert all content at index 1
    return [
        {
            "insertText": {
                "location": {"index": 1},
                "text": full_text,
            }
        }
    ]
