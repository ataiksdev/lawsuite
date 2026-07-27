# backend/app/services/report_service.py
import uuid
from datetime import date, datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from jinja2 import Environment, FileSystemLoader
import os

from app.models.activity_log import ActivityLog
from app.models.client import Client
from app.models.matter import Matter, MatterStatus
from app.models.matter_document import DocumentStatus, MatterDocument
from app.models.organisation import Organisation
from app.models.report import Report
from app.models.task import Task, TaskStatus
from app.schemas.report import (
    ClientActivity,
    DocumentSummary,
    MatterActivity,
    ReportData,
    ReportGenerateRequest,
    TaskSummary,
)


def _matter_type_label(matter_type: str) -> str:
    """Human-readable matter category, e.g. 'intellectual_property' -> 'Intellectual Property'."""
    if matter_type == "adr":
        return "ADR"
    return matter_type.replace("_", " ").title()


def _report_title(data: ReportData) -> str:
    """The one title used everywhere: saved Report record, Google Doc, HTML masthead, email."""
    return f"{data.subject_label} Report for {data.period_label}"


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
        # Initialize Jinja2 environment for HTML reports
        template_dir = os.path.join(os.path.dirname(__file__), "..", "templates")
        self.jinja_env = Environment(loader=FileSystemLoader(template_dir))

    # ── Core aggregation ──────────────────────────────────────────────────

    async def aggregate(
        self,
        org_id: uuid.UUID,
        date_from: date,
        date_to: date,
        client_id: uuid.UUID | None = None,
        matter_id: uuid.UUID | None = None,
        matter_type: str | None = None,
    ) -> ReportData:
        """
        Query the activity_log and related tables to build the full
        report data structure.  All queries are scoped to org_id.
        """
        # Convert dates to timezone-aware datetimes for comparison
        dt_from = datetime.combine(date_from, datetime.min.time()).replace(tzinfo=timezone.utc)
        dt_to = datetime.combine(date_to, datetime.max.time()).replace(tzinfo=timezone.utc)

        # ── Org name ──────────────────────────────────────────────────────
        org_result = await self.db.execute(select(Organisation).where(Organisation.id == org_id))
        org = org_result.scalar_one()

        # ── Subject label: what this report is "about" ──────────────────────
        # Most-specific filter wins: a single matter > a single client > a
        # category > (no filter) the organisation itself.
        subject_label = org.name
        if matter_type:
            subject_label = _matter_type_label(matter_type)
        if client_id:
            client_result = await self.db.execute(select(Client).where(Client.id == client_id))
            filtered_client = client_result.scalar_one_or_none()
            if filtered_client:
                subject_label = filtered_client.name
        if matter_id:
            matter_result = await self.db.execute(select(Matter).where(Matter.id == matter_id))
            filtered_matter = matter_result.scalar_one_or_none()
            if filtered_matter:
                subject_label = filtered_matter.title

        # ── All matters active in period ───────────────────────────────────
        # A matter is "active" if it was open at any point during the period
        matters_query = select(Matter).where(
            Matter.organisation_id == org_id,
            Matter.status != MatterStatus.archived,
        )

        if client_id:
            matters_query = matters_query.where(Matter.client_id == client_id)
        if matter_id:
            matters_query = matters_query.where(Matter.id == matter_id)
        if matter_type:
            matters_query = matters_query.where(Matter.matter_type == matter_type)

        matters_result = await self.db.execute(matters_query)
        all_matters = matters_result.scalars().all()
        
        # ── All activity in period ─────────────────────────────────────────
        if all_matters:
            matter_ids = [m.id for m in all_matters]
            activity_result = await self.db.execute(
                select(ActivityLog)
                .where(
                    ActivityLog.organisation_id == org_id,
                    ActivityLog.matter_id.in_(matter_ids),
                    ActivityLog.created_at >= dt_from,
                    ActivityLog.created_at <= dt_to,
                )
                .order_by(ActivityLog.created_at)
            )
            all_logs = activity_result.scalars().all()
        else:
            all_logs = []
            
        total_events = len(all_logs)

        # Index logs by matter_id for efficient per-matter grouping
        logs_by_matter: dict[uuid.UUID, list[ActivityLog]] = {}
        for log in all_logs:
            logs_by_matter.setdefault(log.matter_id, []).append(log)

        # Count opened/closed during period
        matters_opened = sum(
            1 for m in all_matters if m.opened_at and dt_from <= m.opened_at.replace(tzinfo=timezone.utc) <= dt_to
        )
        matters_closed = sum(
            1 for m in all_matters if m.closed_at and dt_from <= m.closed_at.replace(tzinfo=timezone.utc) <= dt_to
        )

        # ── Build per-client structure ─────────────────────────────────────
        matters_by_client: dict[uuid.UUID, list[Matter]] = {}
        for matter in all_matters:
            matters_by_client.setdefault(matter.client_id, []).append(matter)

        client_activities: list[ClientActivity] = []

        for client_id, matters in matters_by_client.items():
            # Fetch client
            cl_result = await self.db.execute(select(Client).where(Client.id == client_id))
            client = cl_result.scalar_one_or_none()
            if not client:
                continue

            matter_activities: list[MatterActivity] = []

            for matter in matters:
                matter_logs = logs_by_matter.get(matter.id, [])

                # Count events by type
                events_by_type: dict[str, int] = {}
                for log in matter_logs:
                    events_by_type[log.event_type] = events_by_type.get(log.event_type, 0) + 1

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
            org_logo_url=org.logo_url,
            subject_label=subject_label,
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

    async def _task_summary(self, matter_id: uuid.UUID, as_of: datetime) -> TaskSummary:
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
                1
                for t in tasks
                if t.due_date and t.due_date < today and t.status not in (TaskStatus.done, TaskStatus.cancelled)
            ),
        )

    async def _document_summary(self, matter_id: uuid.UUID, dt_from: datetime, dt_to: datetime) -> DocumentSummary:
        result = await self.db.execute(
            select(MatterDocument).where(
                MatterDocument.matter_id == matter_id,
                MatterDocument.is_deleted == False,
            )
        )
        docs = result.scalars().all()
        added_in_period = sum(1 for d in docs if dt_from <= d.added_at.replace(tzinfo=timezone.utc) <= dt_to)
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
        title = _report_title(data)
        doc = (
            drive.files()
            .create(
                body={
                    "name": title,
                    "mimeType": "application/vnd.google-apps.document",
                },
                fields="id,webViewLink",
            )
            .execute()
        )

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

    # ── HTML export ───────────────────────────────────────────────────────

    def generate_html(self, data: ReportData) -> str:
        """
        Renders the report data into an HTML string using the Jinja2 template.
        """
        template = self.jinja_env.get_template("report.html")
        return template.render(data=data)

    # ── Persist and retrieve reports ──────────────────────────────────────

    async def save_report(
        self,
        org_id: uuid.UUID,
        user_id: uuid.UUID | None,
        title: str,
        period_label: str,
        date_from: date,
        date_to: date,
        client_id: uuid.UUID | None,
        matter_id: uuid.UUID | None,
        matter_type: str | None,
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
            client_id=client_id,
            matter_id=matter_id,
            matter_type=matter_type,
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
            select(func.count()).select_from(Report).where(Report.organisation_id == org_id)
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

        data = await self.aggregate(
            org_id=org_id, 
            date_from=date_from, 
            date_to=date_to,
            client_id=req.client_id,
            matter_id=req.matter_id,
            matter_type=req.matter_type,
        )
        data.period_label = period_label

        drive_file_id = None
        drive_url = None

        if req.export_to_drive and credentials:
            drive_file_id, drive_url = await self.export_to_doc(
                data=data,
                org_id=org_id,
                credentials=credentials,
            )

        title = _report_title(data)

        if req.send_email and req.recipient_email and drive_url and credentials:
            from app.services.gmail_service import GmailService

            gmail = GmailService(credentials)
            await gmail.send_report_email(
                recipient=req.recipient_email,
                title=title,
                doc_url=drive_url,
            )

        report = await self.save_report(
            org_id=org_id,
            user_id=user_id,
            title=title,
            period_label=period_label,
            date_from=date_from,
            date_to=date_to,
            client_id=req.client_id,
            matter_id=req.matter_id,
            matter_type=req.matter_type,
            drive_file_id=drive_file_id,
            drive_url=drive_url,
        )

        return data, report


# ── Doc content builder ───────────────────────────────────────────────────────

# Brand colors (see frontend/src/app/globals.css "Broadsheet" palette) —
# kept in sync manually since the Docs API has no access to that stylesheet.
_DOC_ACCENT = "#8a5c1e"
_DOC_MUTED = "#5e5a56"

# Text-style presets applied over a range via updateTextStyle. Dict keys
# double as the Docs API field names, so the "fields" mask is just their
# comma-joined keys — see _style_requests_for_range.
_TEXT_STYLES: dict[str, dict] = {
    "EYEBROW": {
        "bold": True,
        "fontSize": {"magnitude": 9, "unit": "PT"},
        "foregroundColor": None,  # filled in below (avoids repeating _hex_color calls)
    },
    "META": {
        "italic": True,
        "fontSize": {"magnitude": 9, "unit": "PT"},
        "foregroundColor": None,
    },
    "BOLD": {"bold": True},
}


def _hex_color(hex_str: str) -> dict:
    """Convert '#8a5c1e' into a Docs API OptionalColor object (0-1 RGB floats)."""
    h = hex_str.lstrip("#")
    r, g, b = (int(h[i : i + 2], 16) / 255 for i in (0, 2, 4))
    return {"color": {"rgbColor": {"red": r, "green": g, "blue": b}}}


_TEXT_STYLES["EYEBROW"]["foregroundColor"] = _hex_color(_DOC_ACCENT)
_TEXT_STYLES["META"]["foregroundColor"] = _hex_color(_DOC_MUTED)

_PARAGRAPH_STYLES: dict[str, str] = {
    "TITLE": "HEADING_1",
    "HEADING2": "HEADING_2",
}


def _build_doc_requests(data: ReportData) -> list[dict]:
    """
    Build Docs API batchUpdate requests that both populate AND style the
    report: an accent-colored eyebrow line, a heading title carrying the
    report's subject (filtered client/matter/category, or the org name),
    an italic meta line, a bold summary block, and per-client sections
    with bold matter headers and bulleted detail lines.

    All content is inserted as a single string in one insertText request
    (mirroring the previous implementation) — every subsequent style
    request's range is computed from string lengths *before* any request
    is sent, so there's no risk of index drift between requests the way
    there would be if we tried to style paragraphs one insert at a time.
    """
    full_text_parts: list[str] = []
    style_ranges: list[tuple[int, int, str]] = []
    bullet_ranges: list[tuple[int, int]] = []
    cursor = 1  # Docs body content starts at index 1 (index 0 is invalid)

    def emit(text: str, style: str | None = None) -> None:
        nonlocal cursor
        start = cursor
        full_text_parts.append(text)
        cursor += len(text)
        if style:
            style_ranges.append((start, cursor, style))

    emit("LAWMATE · ACTIVITY REPORT\n", "EYEBROW")
    emit(f"{_report_title(data)}\n", "TITLE")
    emit(
        f"Organisation: {data.org_name}   |   "
        f"Period: {data.date_from.strftime('%d %b %Y')} – {data.date_to.strftime('%d %b %Y')}   |   "
        f"Generated: {data.generated_at.strftime('%d %b %Y %H:%M UTC')}\n",
        "META",
    )
    emit("\n")

    emit("Summary\n", "HEADING2")
    emit(f"Total activity events: {data.total_events}\n", "BOLD")
    emit(f"Active matters: {data.matters_active}\n", "BOLD")
    emit(f"Matters opened: {data.matters_opened}\n", "BOLD")
    emit(f"Matters closed: {data.matters_closed}\n", "BOLD")
    emit("\n")

    if not data.clients:
        emit("No activity recorded for this period.\n")

    for client in data.clients:
        emit(f"{client.client_name}\n", "HEADING2")
        total_client_events = sum(m.event_count for m in client.matters)
        emit(f"{client.matter_count} matters · {total_client_events} events this period\n", "META")

        for matter in client.matters:
            status_label = matter.status.replace("_", " ").title()
            emit(f"{matter.reference_no} — {matter.matter_title} ({status_label})\n", "BOLD")

            detail_start = cursor
            emit(f"Events this period: {matter.event_count}\n")
            t = matter.tasks
            emit(f"Tasks: {t.completed}/{t.total} completed, {t.overdue} overdue\n")
            d = matter.documents
            emit(f"Documents: {d.added} added, {d.signed} signed\n")
            bullet_ranges.append((detail_start, cursor))

        emit("\n")

    emit(
        f"Privileged & confidential — prepared for internal use of {data.org_name}. Generated by Lawmate.\n",
        "META",
    )

    requests: list[dict] = [
        {"insertText": {"location": {"index": 1}, "text": "".join(full_text_parts)}}
    ]

    for start, end, style in style_ranges:
        rng = {"startIndex": start, "endIndex": end}
        if style in _PARAGRAPH_STYLES:
            requests.append(
                {
                    "updateParagraphStyle": {
                        "range": rng,
                        "paragraphStyle": {"namedStyleType": _PARAGRAPH_STYLES[style]},
                        "fields": "namedStyleType",
                    }
                }
            )
        if style in _TEXT_STYLES:
            text_style = _TEXT_STYLES[style]
            requests.append(
                {
                    "updateTextStyle": {
                        "range": rng,
                        "textStyle": text_style,
                        "fields": ",".join(text_style.keys()),
                    }
                }
            )

    for start, end in bullet_ranges:
        requests.append(
            {
                "createParagraphBullets": {
                    "range": {"startIndex": start, "endIndex": end},
                    "bulletPreset": "BULLET_DISC_CIRCLE_SQUARE",
                }
            }
        )

    return requests
