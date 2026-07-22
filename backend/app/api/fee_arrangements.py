# backend/app/api/fee_arrangements.py
"""
Fee Arrangements API — nested under /matters/{matter_id}/fee-arrangements.

Routes:
  GET   /matters/{matter_id}/fee-arrangements                         — list
  POST  /matters/{matter_id}/fee-arrangements                         — create (deactivates any existing active one)
  PATCH /matters/{matter_id}/fee-arrangements/{fee_arrangement_id}    — update
"""
import uuid

from fastapi import APIRouter, status

from app.core.deps import ScopedDB, AdminUser
from app.schemas.fee_arrangement import FeeArrangementCreate, FeeArrangementResponse, FeeArrangementUpdate
from app.services.fee_arrangement_service import FeeArrangementService

router = APIRouter()


@router.get("/{matter_id}/fee-arrangements", response_model=list[FeeArrangementResponse])
async def list_fee_arrangements(matter_id: uuid.UUID, current_user: AdminUser, db: ScopedDB):
    service = FeeArrangementService(db)
    arrangements = await service.list_fee_arrangements(matter_id, current_user.org_id)
    return [FeeArrangementResponse.model_validate(a) for a in arrangements]


@router.post(
    "/{matter_id}/fee-arrangements",
    response_model=FeeArrangementResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_fee_arrangement(
    matter_id: uuid.UUID,
    payload: FeeArrangementCreate,
    current_user: AdminUser,
    db: ScopedDB,
):
    service = FeeArrangementService(db)
    arrangement = await service.create_fee_arrangement(matter_id, current_user.org_id, payload)
    return FeeArrangementResponse.model_validate(arrangement)


@router.patch("/{matter_id}/fee-arrangements/{fee_arrangement_id}", response_model=FeeArrangementResponse)
async def update_fee_arrangement(
    matter_id: uuid.UUID,
    fee_arrangement_id: uuid.UUID,
    payload: FeeArrangementUpdate,
    current_user: AdminUser,
    db: ScopedDB,
):
    service = FeeArrangementService(db)
    arrangement = await service.update_fee_arrangement(fee_arrangement_id, matter_id, current_user.org_id, payload)
    return FeeArrangementResponse.model_validate(arrangement)
