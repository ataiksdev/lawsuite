# backend/app/api/reports.py
import math
import uuid

from fastapi import APIRouter, Query, status

from app.core.deps import DB, AuthUser
from app.schemas.report import ReportGenerateRequest, ReportResponse

router = APIRouter()


@router.post("/generate", response_model=dict, status_code=status.HTTP_201_CREATED)
async def generate_report(
    payload: ReportGenerateRequest,
    current_user: AuthUser,
    db: DB,
):
    """
    Generate an activity report for the current organisation.

    - period_type: "weekly" (last 7 days), "monthly" (last calendar month),
                   or "custom" (requires date_from + date_to)
    - export_to_drive: creates a Google Doc and returns its URL
    - send_email: sends the report link to recipient_email via Gmail

    Both export_to_drive and send_email require Google Workspace to be
    connected. If not connected they are silently skipped.
    Returns the aggregated report data + the persisted report record.
    """
    from app.services.billing_service import BillingService
    from app.services.google_auth_service import GoogleAuthService
    from app.services.report_service import ReportService

    # Gate: reports feature required
    await BillingService(db).check_feature_access(current_user.org_id, "reports")

    # Get Google credentials if available — non-fatal if not connected
    credentials = None
    if payload.export_to_drive or payload.send_email:
        try:
            auth_service = GoogleAuthService(db)
            credentials = await auth_service.get_valid_credentials(current_user.org_id)
        except Exception:
            pass  # Google not connected — skip Drive/Gmail steps

    service = ReportService(db)
    data, report = await service.generate(
        org_id=current_user.org_id,
        user_id=current_user.user_id,
        req=payload,
        credentials=credentials,
    )

    return {
        "report": ReportResponse.model_validate(report),
        "data": data.model_dump(),
    }


@router.get("/history", response_model=dict)
async def list_reports(
    current_user: AuthUser,
    db: DB,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    """
    List all previously generated reports for the current organisation.
    Newest first. Each record includes the Drive URL if exported.
    """
    from app.services.report_service import ReportService

    service = ReportService(db)
    reports, total = await service.list_reports(
        org_id=current_user.org_id,
        page=page,
        page_size=page_size,
    )

    return {
        "items": [ReportResponse.model_validate(r) for r in reports],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": math.ceil(total / page_size) if total else 0,
    }


@router.get("/{report_id}", response_model=ReportResponse)
async def get_report(report_id: uuid.UUID, current_user: AuthUser, db: DB):
    """Get a single report record by ID."""
    from fastapi import HTTPException
    from sqlalchemy import select

    from app.models.report import Report

    result = await db.execute(
        select(Report).where(
            Report.id == report_id,
            Report.organisation_id == current_user.org_id,
        )
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return ReportResponse.model_validate(report)
