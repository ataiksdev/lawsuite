# backend/app/api/invoices.py
"""
Invoices API — top-level, /invoices. matter_id/client_id/status are optional
query filters, not path segments — Invoice itself carries no matter_id
column since one invoice can span multiple matters (see invoice_service.py).

Routes:
  GET    /invoices                                       — list (matter_id/client_id/status filters)
  POST   /invoices                                        — create draft
  GET    /invoices/{invoice_id}                           — get one
  PATCH  /invoices/{invoice_id}                           — edit draft
  POST   /invoices/{invoice_id}/issue                     — draft -> sent, assigns number
  POST   /invoices/{invoice_id}/void                      — void
  POST   /invoices/{invoice_id}/mark-served                — Bill of Charges served_at
  GET    /invoices/{invoice_id}/pdf                        — render PDF
  POST   /invoices/{invoice_id}/line-items                 — add line item (draft only)
  PATCH  /invoices/{invoice_id}/line-items/{line_item_id}  — edit line item (draft only)
  DELETE /invoices/{invoice_id}/line-items/{line_item_id}  — remove line item (draft only)
"""
import math
import uuid

from fastapi import APIRouter, Query, Response, status

from app.core.deps import ScopedDB, AuthUser, MemberUser
from app.models.invoice import Invoice, InvoiceStatus
from app.schemas.invoice import (
    InvoiceCreate,
    InvoiceLineItemCreate,
    InvoiceLineItemUpdate,
    InvoiceListResponse,
    InvoiceResponse,
    MarkServedRequest,
    UpdateInvoiceRequest,
    VoidInvoiceRequest,
)
from app.services.invoice_service import InvoiceService, _distinct_matter_ids, eligible_to_sue_date

router = APIRouter()


def _to_response(invoice: Invoice) -> InvoiceResponse:
    response = InvoiceResponse.model_validate(invoice)
    response.matter_ids = _distinct_matter_ids(invoice)
    response.eligible_to_sue_date = eligible_to_sue_date(invoice)
    return response


@router.get("", response_model=InvoiceListResponse)
async def list_invoices(
    current_user: AuthUser,
    db: ScopedDB,
    matter_id: uuid.UUID | None = Query(None),
    client_id: uuid.UUID | None = Query(None),
    invoice_status: InvoiceStatus | None = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
):
    service = InvoiceService(db)
    invoices, total = await service.list_invoices(
        org_id=current_user.org_id,
        matter_id=matter_id,
        client_id=client_id,
        invoice_status=invoice_status,
        page=page,
        page_size=page_size,
    )
    return InvoiceListResponse(
        items=[_to_response(inv) for inv in invoices],
        total=total,
        page=page,
        page_size=page_size,
        pages=math.ceil(total / page_size) if total else 0,
    )


@router.post("", response_model=InvoiceResponse, status_code=status.HTTP_201_CREATED)
async def create_invoice(payload: InvoiceCreate, current_user: MemberUser, db: ScopedDB):
    service = InvoiceService(db)
    invoice = await service.create_invoice(current_user.org_id, current_user.user_id, payload)
    return _to_response(invoice)


@router.get("/{invoice_id}", response_model=InvoiceResponse)
async def get_invoice(invoice_id: uuid.UUID, current_user: AuthUser, db: ScopedDB):
    service = InvoiceService(db)
    invoice = await service.get_invoice(invoice_id, current_user.org_id)
    return _to_response(invoice)


@router.patch("/{invoice_id}", response_model=InvoiceResponse)
async def update_invoice(
    invoice_id: uuid.UUID, payload: UpdateInvoiceRequest, current_user: MemberUser, db: ScopedDB
):
    service = InvoiceService(db)
    invoice = await service.update_invoice(invoice_id, current_user.org_id, payload)
    return _to_response(invoice)


@router.post("/{invoice_id}/issue", response_model=InvoiceResponse)
async def issue_invoice(invoice_id: uuid.UUID, current_user: MemberUser, db: ScopedDB):
    service = InvoiceService(db)
    invoice = await service.issue_invoice(invoice_id, current_user.org_id, current_user.user_id)
    return _to_response(invoice)


@router.post("/{invoice_id}/void", response_model=InvoiceResponse)
async def void_invoice(
    invoice_id: uuid.UUID, payload: VoidInvoiceRequest, current_user: MemberUser, db: ScopedDB
):
    service = InvoiceService(db)
    invoice = await service.void_invoice(invoice_id, current_user.org_id, current_user.user_id, payload.reason)
    return _to_response(invoice)


@router.post("/{invoice_id}/mark-served", response_model=InvoiceResponse)
async def mark_served(
    invoice_id: uuid.UUID, payload: MarkServedRequest, current_user: MemberUser, db: ScopedDB
):
    service = InvoiceService(db)
    invoice = await service.mark_served(invoice_id, current_user.org_id, payload.served_at)
    return _to_response(invoice)


@router.get("/{invoice_id}/pdf")
async def get_invoice_pdf(invoice_id: uuid.UUID, current_user: AuthUser, db: ScopedDB):
    service = InvoiceService(db)
    pdf_bytes = await service.render_pdf(invoice_id, current_user.org_id)
    return Response(content=pdf_bytes, media_type="application/pdf")


@router.post("/{invoice_id}/line-items", response_model=InvoiceResponse)
async def add_line_item(
    invoice_id: uuid.UUID, payload: InvoiceLineItemCreate, current_user: MemberUser, db: ScopedDB
):
    service = InvoiceService(db)
    invoice = await service.add_line_item(invoice_id, current_user.org_id, payload)
    return _to_response(invoice)


@router.patch("/{invoice_id}/line-items/{line_item_id}", response_model=InvoiceResponse)
async def update_line_item(
    invoice_id: uuid.UUID,
    line_item_id: uuid.UUID,
    payload: InvoiceLineItemUpdate,
    current_user: MemberUser,
    db: ScopedDB,
):
    service = InvoiceService(db)
    invoice = await service.update_line_item(invoice_id, line_item_id, current_user.org_id, payload)
    return _to_response(invoice)


@router.delete("/{invoice_id}/line-items/{line_item_id}", response_model=InvoiceResponse)
async def delete_line_item(
    invoice_id: uuid.UUID, line_item_id: uuid.UUID, current_user: MemberUser, db: ScopedDB
):
    service = InvoiceService(db)
    invoice = await service.delete_line_item(invoice_id, line_item_id, current_user.org_id)
    return _to_response(invoice)
