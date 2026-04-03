# backend/app/services/matter_service.py
import uuid
import math
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from fastapi import HTTPException, status

from app.models.matter import Matter, MatterStatus
from app.models.client import Client
from app.schemas.matter import MatterCreate, MatterUpdate, StatusUpdate
from app.services.activity_service import ActivityService


# Valid stage transitions — prevents arbitrary jumps
ALLOWED_TRANSITIONS: dict[MatterStatus, list[MatterStatus]] = {
    MatterStatus.intake:    [MatterStatus.open, MatterStatus.archived],
    MatterStatus.open:      [MatterStatus.pending, MatterStatus.in_review, MatterStatus.closed, MatterStatus.archived],
    MatterStatus.pending:   [MatterStatus.open, MatterStatus.in_review, MatterStatus.closed, MatterStatus.archived],
    MatterStatus.in_review: [MatterStatus.open, MatterStatus.pending, MatterStatus.closed, MatterStatus.archived],
    MatterStatus.closed:    [MatterStatus.open, MatterStatus.archived],
    MatterStatus.archived:  [MatterStatus.open],
}


async def _generate_reference(db: AsyncSession, org_id: uuid.UUID) -> str:
    year = datetime.now(timezone.utc).year
    count_result = await db.execute(
        select(func.count()).select_from(Matter).where(
            Matter.organisation_id == org_id,
            Matter.reference_no.like(f"MAT-{year}-%"),
        )
    )
    count = count_result.scalar_one()
    return f"MAT-{year}-{str(count + 1).zfill(4)}"


class MatterService:

    def __init__(self, db: AsyncSession):
        self.db = db
        self.activity = ActivityService(db)

    # ── Helpers ───────────────────────────────────────────────────────────

    async def _get_matter(self, matter_id: uuid.UUID, org_id: uuid.UUID) -> Matter:
        result = await self.db.execute(
            select(Matter)
            .options(selectinload(Matter.client))
            .where(
                Matter.id == matter_id,
                Matter.organisation_id == org_id,
            )
        )
        matter = result.scalar_one_or_none()
        if not matter:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Matter not found")
        return matter

    async def _verify_client(self, client_id: uuid.UUID, org_id: uuid.UUID) -> None:
        result = await self.db.execute(
            select(Client).where(
                Client.id == client_id,
                Client.organisation_id == org_id,
                Client.is_active == True,
            )
        )
        if not result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Client not found or inactive",
            )

    # ── CRUD ──────────────────────────────────────────────────────────────

    async def list_matters(
        self,
        org_id: uuid.UUID,
        status_filter: MatterStatus | None = None,
        client_id: uuid.UUID | None = None,
        assigned_to: uuid.UUID | None = None,
        search: str | None = None,
        page: int = 1,
        page_size: int = 25,
    ) -> tuple[list[Matter], int]:
        query = (
            select(Matter)
            .options(selectinload(Matter.client))
            .where(Matter.organisation_id == org_id)
        )

        if status_filter:
            query = query.where(Matter.status == status_filter)
        if client_id:
            query = query.where(Matter.client_id == client_id)
        if assigned_to:
            query = query.where(Matter.assigned_to == assigned_to)
        if search:
            query = query.where(
                Matter.title.ilike(f"%{search}%") |
                Matter.reference_no.ilike(f"%{search}%")
            )

        count_q = select(func.count()).select_from(query.subquery())
        total = (await self.db.execute(count_q)).scalar_one()

        query = (
            query.order_by(Matter.updated_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        result = await self.db.execute(query)
        return list(result.scalars().all()), total

    async def get_matter(self, matter_id: uuid.UUID, org_id: uuid.UUID) -> Matter:
        return await self._get_matter(matter_id, org_id)

    async def create_matter(
        self,
        org_id: uuid.UUID,
        user_id: uuid.UUID,
        data: MatterCreate,
    ) -> Matter:
        await self._verify_client(data.client_id, org_id)

        reference_no = await _generate_reference(self.db, org_id)

        matter = Matter(
            organisation_id=org_id,
            client_id=data.client_id,
            assigned_to=data.assigned_to,
            title=data.title.strip(),
            reference_no=reference_no,
            matter_type=data.matter_type,
            status=MatterStatus.intake,
            description=data.description,
            target_close_at=data.target_close_at,
        )
        self.db.add(matter)
        await self.db.flush()

        await self.activity.log(
            matter_id=matter.id,
            org_id=org_id,
            actor_id=user_id,
            event_type="matter_created",
            payload={
                "title": matter.title,
                "type": matter.matter_type,
                "reference_no": matter.reference_no,
            },
        )

        await self.db.commit()
        await self.db.refresh(matter)

        # Trigger Drive folder creation (Phase 6 — queued via Celery)
        # from app.workers.tasks import create_drive_folder
        # create_drive_folder.delay(str(matter.id), str(org_id))

        return await self._get_matter(matter.id, org_id)

    async def update_matter(
        self,
        matter_id: uuid.UUID,
        org_id: uuid.UUID,
        user_id: uuid.UUID,
        data: MatterUpdate,
    ) -> Matter:
        matter = await self._get_matter(matter_id, org_id)

        if data.client_id is not None:
            await self._verify_client(data.client_id, org_id)

        update_data = data.model_dump(exclude_unset=True)
        changed: dict = {}

        for field, value in update_data.items():
            old = getattr(matter, field)
            if old != value:
                changed[field] = {"from": str(old) if old else None, "to": str(value) if value else None}
                setattr(matter, field, value)

        if changed:
            await self.activity.log(
                matter_id=matter_id,
                org_id=org_id,
                actor_id=user_id,
                event_type="matter_updated",
                payload={"changes": changed},
            )

        await self.db.commit()
        return await self._get_matter(matter_id, org_id)

    async def change_status(
        self,
        matter_id: uuid.UUID,
        org_id: uuid.UUID,
        user_id: uuid.UUID,
        data: StatusUpdate,
    ) -> Matter:
        matter = await self._get_matter(matter_id, org_id)
        old_status = matter.status
        new_status = data.status

        if old_status == new_status:
            return matter

        allowed = ALLOWED_TRANSITIONS.get(old_status, [])
        if new_status not in allowed:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Cannot transition from '{old_status}' to '{new_status}'",
            )

        matter.status = new_status

        if new_status == MatterStatus.closed:
            matter.closed_at = datetime.now(timezone.utc)
        elif old_status == MatterStatus.closed:
            matter.closed_at = None

        await self.activity.log(
            matter_id=matter_id,
            org_id=org_id,
            actor_id=user_id,
            event_type="status_changed",
            payload={
                "from": old_status,
                "to": new_status,
                "reason": data.reason,
            },
        )

        await self.db.commit()
        return await self._get_matter(matter_id, org_id)

    async def delete_matter(
        self,
        matter_id: uuid.UUID,
        org_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> None:
        matter = await self._get_matter(matter_id, org_id)
        if matter.status not in (MatterStatus.archived,):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Only archived matters can be deleted. Archive the matter first.",
            )
        await self.db.delete(matter)
        await self.db.commit()
