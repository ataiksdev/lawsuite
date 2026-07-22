# backend/app/api/disbursements.py
"""
Disbursements API — nested under /matters/{matter_id}/disbursements.

Routes:
  GET    /matters/{matter_id}/disbursements                     — list (?unbilled_only=true)
  POST   /matters/{matter_id}/disbursements                     — create
  PATCH  /matters/{matter_id}/disbursements/{disbursement_id}   — update (422 once invoiced)
  DELETE /matters/{matter_id}/disbursements/{disbursement_id}   — delete (422 once invoiced)
"""
import uuid

from fastapi import APIRouter, Query, status

from app.core.deps import ScopedDB, AdminUser
from app.schemas.disbursement import DisbursementCreate, DisbursementResponse, DisbursementUpdate
from app.services.disbursement_service import DisbursementService

router = APIRouter()


@router.get("/{matter_id}/disbursements", response_model=list[DisbursementResponse])
async def list_disbursements(
    matter_id: uuid.UUID,
    current_user: AdminUser,
    db: ScopedDB,
    unbilled_only: bool = Query(False),
):
    service = DisbursementService(db)
    disbursements = await service.list_disbursements(matter_id, current_user.org_id, unbilled_only=unbilled_only)
    return [DisbursementResponse.model_validate(d) for d in disbursements]


@router.post(
    "/{matter_id}/disbursements",
    response_model=DisbursementResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_disbursement(
    matter_id: uuid.UUID,
    payload: DisbursementCreate,
    current_user: AdminUser,
    db: ScopedDB,
):
    service = DisbursementService(db)
    disbursement = await service.create_disbursement(matter_id, current_user.org_id, payload)
    return DisbursementResponse.model_validate(disbursement)


@router.patch("/{matter_id}/disbursements/{disbursement_id}", response_model=DisbursementResponse)
async def update_disbursement(
    matter_id: uuid.UUID,
    disbursement_id: uuid.UUID,
    payload: DisbursementUpdate,
    current_user: AdminUser,
    db: ScopedDB,
):
    service = DisbursementService(db)
    disbursement = await service.update_disbursement(disbursement_id, matter_id, current_user.org_id, payload)
    return DisbursementResponse.model_validate(disbursement)


@router.delete("/{matter_id}/disbursements/{disbursement_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_disbursement(
    matter_id: uuid.UUID,
    disbursement_id: uuid.UUID,
    current_user: AdminUser,
    db: ScopedDB,
):
    service = DisbursementService(db)
    await service.delete_disbursement(disbursement_id, matter_id, current_user.org_id)
