# backend/app/services/activity_service.py
import uuid
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.models.activity_log import ActivityLog


class ActivityService:
    """
    Writes immutable activity log entries.
    Called by every service that mutates a matter or its children.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def log(
        self,
        matter_id: uuid.UUID,
        org_id: uuid.UUID,
        event_type: str,
        payload: dict,
        actor_id: uuid.UUID | None = None,
    ) -> ActivityLog:
        entry = ActivityLog(
            matter_id=matter_id,
            organisation_id=org_id,
            actor_id=actor_id,
            event_type=event_type,
            payload=payload,
            created_at=datetime.now(timezone.utc),
        )
        self.db.add(entry)
        # Don't commit here — caller manages the transaction
        return entry

    async def get_for_matter(
        self,
        matter_id: uuid.UUID,
        org_id: uuid.UUID,
        page: int = 1,
        page_size: int = 50,
    ) -> tuple[list[ActivityLog], int]:
        from sqlalchemy import func

        count_result = await self.db.execute(
            select(func.count()).select_from(ActivityLog).where(
                ActivityLog.matter_id == matter_id,
                ActivityLog.organisation_id == org_id,
            )
        )
        total = count_result.scalar_one()

        result = await self.db.execute(
            select(ActivityLog)
            .where(
                ActivityLog.matter_id == matter_id,
                ActivityLog.organisation_id == org_id,
            )
            .order_by(desc(ActivityLog.created_at))
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        items = list(result.scalars().all())
        return items, total
