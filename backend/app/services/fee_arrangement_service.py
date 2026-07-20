# backend/app/services/fee_arrangement_service.py
"""
FeeArrangementService — per-matter fee arrangements. Only one is_active=True
arrangement per matter at a time; creating a new one deactivates the old one
rather than deleting it, so history is preserved.
"""
import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.fee_arrangement import FeeArrangement
from app.models.matter import Matter
from app.schemas.fee_arrangement import FeeArrangementCreate, FeeArrangementUpdate


class FeeArrangementService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ── Helpers ───────────────────────────────────────────────────────────

    async def _validate_matter(self, matter_id: uuid.UUID, org_id: uuid.UUID) -> Matter:
        result = await self.db.execute(
            select(Matter).where(Matter.id == matter_id, Matter.organisation_id == org_id)
        )
        matter = result.scalar_one_or_none()
        if not matter:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Matter not found")
        return matter

    async def _get_arrangement(
        self, fee_arrangement_id: uuid.UUID, matter_id: uuid.UUID, org_id: uuid.UUID
    ) -> FeeArrangement:
        result = await self.db.execute(
            select(FeeArrangement).where(
                FeeArrangement.id == fee_arrangement_id,
                FeeArrangement.matter_id == matter_id,
                FeeArrangement.organisation_id == org_id,
            )
        )
        arrangement = result.scalar_one_or_none()
        if not arrangement:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fee arrangement not found")
        return arrangement

    # ── List ──────────────────────────────────────────────────────────────

    async def list_fee_arrangements(self, matter_id: uuid.UUID, org_id: uuid.UUID) -> list[FeeArrangement]:
        await self._validate_matter(matter_id, org_id)
        result = await self.db.execute(
            select(FeeArrangement)
            .where(FeeArrangement.matter_id == matter_id, FeeArrangement.organisation_id == org_id)
            .order_by(FeeArrangement.created_at.desc())
        )
        return list(result.scalars().all())

    # ── Create ────────────────────────────────────────────────────────────

    async def create_fee_arrangement(
        self, matter_id: uuid.UUID, org_id: uuid.UUID, data: FeeArrangementCreate
    ) -> FeeArrangement:
        await self._validate_matter(matter_id, org_id)

        # Keep history — deactivate, never delete, the currently active arrangement.
        existing_result = await self.db.execute(
            select(FeeArrangement).where(
                FeeArrangement.matter_id == matter_id,
                FeeArrangement.organisation_id == org_id,
                FeeArrangement.is_active.is_(True),
            )
        )
        for existing in existing_result.scalars().all():
            existing.is_active = False

        arrangement = FeeArrangement(
            organisation_id=org_id,
            matter_id=matter_id,
            type=data.type,
            params=data.params,
            is_active=True,
        )
        self.db.add(arrangement)
        await self.db.commit()
        await self.db.refresh(arrangement)
        return arrangement

    # ── Update ────────────────────────────────────────────────────────────

    async def update_fee_arrangement(
        self,
        fee_arrangement_id: uuid.UUID,
        matter_id: uuid.UUID,
        org_id: uuid.UUID,
        data: FeeArrangementUpdate,
    ) -> FeeArrangement:
        arrangement = await self._get_arrangement(fee_arrangement_id, matter_id, org_id)
        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(arrangement, field, value)
        await self.db.commit()
        await self.db.refresh(arrangement)
        return arrangement
