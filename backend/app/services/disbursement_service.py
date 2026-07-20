# backend/app/services/disbursement_service.py
"""
DisbursementService — costs incurred on behalf of a matter (court filing
fees, courier, etc.) that get pulled into an invoice line item later via
invoice_service.add_line_item's disbursement_id parameter.
"""
import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.disbursement import Disbursement
from app.models.matter import Matter
from app.schemas.disbursement import DisbursementCreate, DisbursementUpdate


class DisbursementService:
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

    async def _get_disbursement(
        self, disbursement_id: uuid.UUID, matter_id: uuid.UUID, org_id: uuid.UUID
    ) -> Disbursement:
        result = await self.db.execute(
            select(Disbursement).where(
                Disbursement.id == disbursement_id,
                Disbursement.matter_id == matter_id,
                Disbursement.organisation_id == org_id,
            )
        )
        disbursement = result.scalar_one_or_none()
        if not disbursement:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Disbursement not found")
        return disbursement

    # ── List ──────────────────────────────────────────────────────────────

    async def list_disbursements(
        self, matter_id: uuid.UUID, org_id: uuid.UUID, unbilled_only: bool = False
    ) -> list[Disbursement]:
        await self._validate_matter(matter_id, org_id)
        query = select(Disbursement).where(
            Disbursement.matter_id == matter_id, Disbursement.organisation_id == org_id
        )
        if unbilled_only:
            query = query.where(Disbursement.invoiced.is_(False))
        query = query.order_by(Disbursement.incurred_at.desc())
        result = await self.db.execute(query)
        return list(result.scalars().all())

    # ── Create ────────────────────────────────────────────────────────────

    async def create_disbursement(
        self, matter_id: uuid.UUID, org_id: uuid.UUID, data: DisbursementCreate
    ) -> Disbursement:
        await self._validate_matter(matter_id, org_id)
        disbursement = Disbursement(
            organisation_id=org_id,
            matter_id=matter_id,
            type=data.type,
            description=data.description.strip(),
            amount_kobo=data.amount_kobo,
            incurred_at=data.incurred_at,
            notes=data.notes,
        )
        self.db.add(disbursement)
        await self.db.commit()
        await self.db.refresh(disbursement)
        return disbursement

    # ── Update ────────────────────────────────────────────────────────────

    async def update_disbursement(
        self,
        disbursement_id: uuid.UUID,
        matter_id: uuid.UUID,
        org_id: uuid.UUID,
        data: DisbursementUpdate,
    ) -> Disbursement:
        disbursement = await self._get_disbursement(disbursement_id, matter_id, org_id)
        if disbursement.invoiced:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Cannot edit a disbursement that has already been invoiced",
            )
        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            if field == "description" and isinstance(value, str):
                value = value.strip()
            setattr(disbursement, field, value)
        await self.db.commit()
        await self.db.refresh(disbursement)
        return disbursement

    # ── Delete ────────────────────────────────────────────────────────────

    async def delete_disbursement(self, disbursement_id: uuid.UUID, matter_id: uuid.UUID, org_id: uuid.UUID) -> None:
        disbursement = await self._get_disbursement(disbursement_id, matter_id, org_id)
        if disbursement.invoiced:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Cannot delete a disbursement that has already been invoiced",
            )
        await self.db.delete(disbursement)
        await self.db.commit()
