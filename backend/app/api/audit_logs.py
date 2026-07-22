# backend/app/api/audit_logs.py
"""
Audit Log API — read-only, admin-only.

Routes:
  GET /audit-logs — paginated list of org-scoped audit entries
"""
import math

from fastapi import APIRouter, Query

from app.core.deps import AdminUser, ScopedDB
from app.schemas.audit_log import AuditLogListResponse, AuditLogResponse
from app.services.audit_log_service import AuditLogService

router = APIRouter()


@router.get("", response_model=AuditLogListResponse)
async def list_audit_logs(
    current_user: AdminUser,
    db: ScopedDB,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
):
    service = AuditLogService(db)
    entries, total = await service.list_for_org(current_user.org_id, page=page, page_size=page_size)
    return AuditLogListResponse(
        items=[AuditLogResponse.model_validate(e) for e in entries],
        total=total,
        page=page,
        page_size=page_size,
        pages=math.ceil(total / page_size) if total else 0,
    )
