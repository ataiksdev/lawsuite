# backend/app/schemas/invoice.py
import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.models.invoice import InvoiceStatus
from app.models.invoice_line_item import LineItemKind

# ─── Line item requests ────────────────────────────────────────────────────────


class InvoiceLineItemCreate(BaseModel):
    kind: LineItemKind
    # Optional when disbursement_id is set — the service auto-fills it from
    # the linked Disbursement row.
    description: str = Field("", max_length=500)
    quantity: Decimal = Decimal("1")
    unit_amount_kobo: int = Field(..., ge=0)
    # Server computes quantity * unit_amount_kobo when omitted.
    amount_kobo: int | None = Field(None, ge=0)
    matter_id: uuid.UUID | None = None
    fee_arrangement_id: uuid.UUID | None = None
    # Pulls an existing unbilled Disbursement in — auto-fills description,
    # amount_kobo, matter_id, kind=disbursement, and marks it invoiced.
    disbursement_id: uuid.UUID | None = None
    is_vatable: bool = True
    is_wht_applicable: bool = True
    notes: str | None = None


class InvoiceLineItemUpdate(BaseModel):
    kind: LineItemKind | None = None
    description: str | None = Field(None, min_length=1, max_length=500)
    quantity: Decimal | None = None
    unit_amount_kobo: int | None = Field(None, ge=0)
    amount_kobo: int | None = Field(None, ge=0)
    matter_id: uuid.UUID | None = None
    fee_arrangement_id: uuid.UUID | None = None
    is_vatable: bool | None = None
    is_wht_applicable: bool | None = None
    notes: str | None = None


# ─── Invoice requests ───────────────────────────────────────────────────────────


class InvoiceCreate(BaseModel):
    client_id: uuid.UUID
    issue_date: date | None = None  # defaults to today in the service
    due_date: date | None = None
    currency: str = Field("NGN", min_length=3, max_length=3)
    notes: str | None = None
    vat_enabled: bool = True
    # None means "let the service compute the default via wht_applies()".
    wht_enabled: bool | None = None
    is_bill_of_charges: bool = False
    line_items: list[InvoiceLineItemCreate] = []


class UpdateInvoiceRequest(BaseModel):
    """Draft-only. vat_kobo/wht_kobo here are the override mechanism — see
    invoice_service._recompute_totals. Absent/None means "recompute the
    recommendation"; present means "use exactly this value until the next
    line-item mutation recomputes it away"."""

    client_id: uuid.UUID | None = None
    issue_date: date | None = None
    due_date: date | None = None
    currency: str | None = Field(None, min_length=3, max_length=3)
    notes: str | None = None
    vat_enabled: bool | None = None
    wht_enabled: bool | None = None
    is_bill_of_charges: bool | None = None
    vat_kobo: int | None = Field(None, ge=0)
    wht_kobo: int | None = Field(None, ge=0)


class VoidInvoiceRequest(BaseModel):
    reason: str | None = Field(None, max_length=500)


class MarkServedRequest(BaseModel):
    served_at: datetime | None = None  # defaults to now if omitted


# ─── Responses ───────────────────────────────────────────────────────────────


class InvoiceLineItemResponse(BaseModel):
    id: uuid.UUID
    invoice_id: uuid.UUID
    organisation_id: uuid.UUID
    matter_id: uuid.UUID | None
    fee_arrangement_id: uuid.UUID | None
    kind: LineItemKind
    description: str
    quantity: Decimal
    unit_amount_kobo: int
    amount_kobo: int
    is_vatable: bool
    is_wht_applicable: bool
    notes: str | None

    model_config = {"from_attributes": True}


class InvoiceResponse(BaseModel):
    id: uuid.UUID
    organisation_id: uuid.UUID
    client_id: uuid.UUID
    number: str | None
    status: InvoiceStatus
    issue_date: date
    due_date: date | None
    currency: str
    subtotal_kobo: int
    disbursements_kobo: int
    total_kobo: int
    net_payable_kobo: int
    amount_paid_kobo: int
    vat_kobo: int
    wht_kobo: int
    vat_enabled: bool
    wht_enabled: bool
    is_bill_of_charges: bool
    served_at: datetime | None
    notes: str | None
    created_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
    line_items: list[InvoiceLineItemResponse] = []

    # Derived, not stored — populated by the service/router, not by
    # from_attributes off the ORM object directly.
    matter_ids: list[uuid.UUID] = []
    eligible_to_sue_date: date | None = None

    model_config = {"from_attributes": True}


class InvoiceListResponse(BaseModel):
    """Paginated invoice list."""

    items: list[InvoiceResponse]
    total: int
    page: int
    page_size: int
    pages: int
