# backend/app/services/audit_log_service.py
"""
AuditLogService — writes and reads org-scoped audit entries for admin
actions that don't fit ActivityLog's matter_id-required shape (deleting a
client, deleting an invoice that spans zero or several matters).
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog


class AuditLogService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def log(
        self,
        org_id: uuid.UUID,
        action: str,
        entity_type: str,
        entity_id: uuid.UUID,
        summary: str,
        actor_id: uuid.UUID | None = None,
        metadata: dict | None = None,
    ) -> AuditLog:
        entry = AuditLog(
            organisation_id=org_id,
            actor_id=actor_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            summary=summary,
            entry_metadata=metadata or {},
            created_at=datetime.now(timezone.utc),
        )
        self.db.add(entry)
        # Don't commit here — caller manages the transaction.
        return entry

    async def list_for_org(
        self, org_id: uuid.UUID, page: int = 1, page_size: int = 50
    ) -> tuple[list[AuditLog], int]:
        count_result = await self.db.execute(
            select(func.count()).select_from(AuditLog).where(AuditLog.organisation_id == org_id)
        )
        total = count_result.scalar_one()

        result = await self.db.execute(
            select(AuditLog)
            .where(AuditLog.organisation_id == org_id)
            .order_by(desc(AuditLog.created_at))
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return list(result.scalars().all()), total
