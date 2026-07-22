# backend/app/services/invoice_service.py
"""
InvoiceService — draft creation, line-item CRUD, issue/void/mark-served,
totals recomputation, and PDF rendering.

One invoice can cover zero, one, or several matters: there is deliberately
no Invoice.matter_id column. "Which matters does this invoice cover" is
derived from the distinct, non-null InvoiceLineItem.matter_id values —
see _distinct_matter_ids below.
"""
import os
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from io import BytesIO

from fastapi import HTTPException, status
from jinja2 import Environment, FileSystemLoader
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from xhtml2pdf import pisa

from app.models.client import Client
from app.models.disbursement import Disbursement
from app.models.fee_arrangement import FeeArrangement
from app.models.invoice import Invoice, InvoiceStatus
from app.models.invoice_line_item import InvoiceLineItem, LineItemKind
from app.models.matter import Matter
from app.models.organisation import Organisation
from app.schemas.invoice import InvoiceCreate, InvoiceLineItemCreate, InvoiceLineItemUpdate, UpdateInvoiceRequest
from app.services import tax_engine
from app.services.activity_service import ActivityService

# [VERIFY with counsel — commonly cited as LPA Cap L11 LFN 2004 s.16,
# unconfirmed]. Purely informational date math — no enforcement, no gating.
BILL_OF_CHARGES_WAITING_PERIOD_DAYS = 30


def _distinct_matter_ids(invoice: Invoice) -> list[uuid.UUID]:
    seen: dict[uuid.UUID, None] = {}
    for item in invoice.line_items:
        if item.matter_id is not None and item.matter_id not in seen:
            seen[item.matter_id] = None
    return list(seen.keys())


def eligible_to_sue_date(invoice: Invoice) -> date | None:
    if not invoice.is_bill_of_charges or invoice.served_at is None:
        return None
    return (invoice.served_at + timedelta(days=BILL_OF_CHARGES_WAITING_PERIOD_DAYS)).date()


def _format_kobo(kobo: int, currency: str = "NGN") -> str:
    # Currency code prefix, not a symbol — avoids Naira-glyph rendering
    # issues in xhtml2pdf's base fonts (confirmed: reportlab's built-in
    # Helvetica has no glyph for U+20A6).
    return f"{currency} {kobo / 100:,.2f}"


class InvoiceService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.activity = ActivityService(db)
        template_dir = os.path.join(os.path.dirname(__file__), "..", "templates")
        self.jinja_env = Environment(loader=FileSystemLoader(template_dir))

    # ── Helpers ───────────────────────────────────────────────────────────

    async def _get_invoice(self, invoice_id: uuid.UUID, org_id: uuid.UUID) -> Invoice:
        result = await self.db.execute(
            select(Invoice)
            .options(selectinload(Invoice.line_items))
            .where(Invoice.id == invoice_id, Invoice.organisation_id == org_id)
        )
        invoice = result.scalar_one_or_none()
        if not invoice:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
        return invoice

    async def _validate_client(self, client_id: uuid.UUID, org_id: uuid.UUID) -> Client:
        result = await self.db.execute(
            select(Client).where(Client.id == client_id, Client.organisation_id == org_id)
        )
        client = result.scalar_one_or_none()
        if not client:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")
        return client

    async def _validate_matter(self, matter_id: uuid.UUID, org_id: uuid.UUID) -> Matter:
        result = await self.db.execute(
            select(Matter).where(Matter.id == matter_id, Matter.organisation_id == org_id)
        )
        matter = result.scalar_one_or_none()
        if not matter:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Matter not found")
        return matter

    async def _validate_fee_arrangement(
        self, fee_arrangement_id: uuid.UUID, matter_id: uuid.UUID | None, org_id: uuid.UUID
    ) -> FeeArrangement:
        result = await self.db.execute(
            select(FeeArrangement).where(
                FeeArrangement.id == fee_arrangement_id, FeeArrangement.organisation_id == org_id
            )
        )
        arrangement = result.scalar_one_or_none()
        if not arrangement:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fee arrangement not found")
        if matter_id is not None and arrangement.matter_id != matter_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Fee arrangement does not belong to the given matter",
            )
        return arrangement

    async def _month_to_date_total_kobo(self, client_id: uuid.UUID, org_id: uuid.UUID, before: date) -> int:
        month_start = before.replace(day=1)
        result = await self.db.execute(
            select(func.coalesce(func.sum(Invoice.total_kobo), 0)).where(
                Invoice.client_id == client_id,
                Invoice.organisation_id == org_id,
                Invoice.status.notin_([InvoiceStatus.draft, InvoiceStatus.void]),
                Invoice.issue_date >= month_start,
                Invoice.issue_date < before,
            )
        )
        return result.scalar_one()

    def _recompute_totals(
        self, invoice: Invoice, vat_override: int | None = None, wht_override: int | None = None
    ) -> None:
        line_item_inputs = [
            tax_engine.LineItemInput(
                kind=item.kind.value,
                amount_kobo=item.amount_kobo,
                is_vatable=item.is_vatable,
                is_wht_applicable=item.is_wht_applicable,
            )
            for item in invoice.line_items
        ]
        totals = tax_engine.compute_invoice_totals(line_item_inputs, wht_applicable=invoice.wht_enabled)

        invoice.subtotal_kobo = totals.subtotal_kobo
        invoice.disbursements_kobo = totals.disbursements_kobo

        invoice.vat_kobo = vat_override if vat_override is not None else (
            totals.vat_kobo if invoice.vat_enabled else 0
        )
        invoice.wht_kobo = wht_override if wht_override is not None else totals.wht_kobo

        invoice.total_kobo = invoice.subtotal_kobo + invoice.disbursements_kobo + invoice.vat_kobo
        invoice.net_payable_kobo = invoice.total_kobo - invoice.wht_kobo

    async def _build_line_item(
        self, org_id: uuid.UUID, invoice_id: uuid.UUID, data: InvoiceLineItemCreate
    ) -> InvoiceLineItem:
        matter_id = data.matter_id
        fee_arrangement_id = data.fee_arrangement_id
        kind = data.kind
        description = data.description.strip()
        unit_amount_kobo = data.unit_amount_kobo
        quantity = data.quantity
        is_vatable = data.is_vatable
        is_wht_applicable = data.is_wht_applicable
        disbursement: Disbursement | None = None

        if data.disbursement_id is not None:
            result = await self.db.execute(
                select(Disbursement).where(
                    Disbursement.id == data.disbursement_id, Disbursement.organisation_id == org_id
                )
            )
            disbursement = result.scalar_one_or_none()
            if not disbursement:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Disbursement not found")
            if disbursement.invoiced:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Disbursement has already been invoiced",
                )
            matter_id = disbursement.matter_id
            kind = LineItemKind.disbursement
            description = disbursement.description
            unit_amount_kobo = disbursement.amount_kobo
            quantity = Decimal("1")
            is_vatable = disbursement.type.value == "recharge"
            is_wht_applicable = False

        if matter_id is not None:
            await self._validate_matter(matter_id, org_id)
        if fee_arrangement_id is not None:
            await self._validate_fee_arrangement(fee_arrangement_id, matter_id, org_id)

        amount_kobo = data.amount_kobo
        if amount_kobo is None:
            amount_kobo = int(quantity * unit_amount_kobo)

        line_item = InvoiceLineItem(
            id=uuid.uuid4(),
            organisation_id=org_id,
            invoice_id=invoice_id,
            matter_id=matter_id,
            fee_arrangement_id=fee_arrangement_id,
            kind=kind,
            description=description,
            quantity=quantity,
            unit_amount_kobo=unit_amount_kobo,
            amount_kobo=amount_kobo,
            is_vatable=is_vatable,
            is_wht_applicable=is_wht_applicable,
            notes=data.notes,
        )
        self.db.add(line_item)

        if disbursement is not None:
            # Flush so line_item.id exists in the DB before the disbursement's
            # FK update references it — no ORM relationship links the two, so
            # the unit of work can't infer insert-before-update ordering here.
            await self.db.flush()
            disbursement.invoiced = True
            disbursement.invoice_line_item_id = line_item.id

        return line_item

    # ── Create ────────────────────────────────────────────────────────────

    async def create_invoice(self, org_id: uuid.UUID, user_id: uuid.UUID, data: InvoiceCreate) -> Invoice:
        client = await self._validate_client(data.client_id, org_id)
        issue_date = data.issue_date or date.today()

        wht_enabled = data.wht_enabled
        if wht_enabled is None:
            month_to_date = await self._month_to_date_total_kobo(data.client_id, org_id, issue_date)
            wht_enabled = tax_engine.wht_applies(client.client_type, month_to_date)

        invoice = Invoice(
            id=uuid.uuid4(),
            organisation_id=org_id,
            client_id=data.client_id,
            number=None,
            status=InvoiceStatus.draft,
            issue_date=issue_date,
            due_date=data.due_date,
            currency=data.currency,
            vat_enabled=data.vat_enabled,
            wht_enabled=wht_enabled,
            is_bill_of_charges=data.is_bill_of_charges,
            notes=data.notes,
            created_by=user_id,
        )
        invoice.line_items = []
        self.db.add(invoice)
        await self.db.flush()

        for line_item_data in data.line_items:
            await self._build_line_item(org_id, invoice.id, line_item_data)

        await self.db.flush()
        await self.db.refresh(invoice, attribute_names=["line_items"])
        self._recompute_totals(invoice)
        await self.db.commit()
        await self.db.refresh(invoice, attribute_names=["line_items"])
        return invoice

    # ── List / Get ────────────────────────────────────────────────────────

    async def list_invoices(
        self,
        org_id: uuid.UUID,
        matter_id: uuid.UUID | None = None,
        client_id: uuid.UUID | None = None,
        invoice_status: InvoiceStatus | None = None,
        page: int = 1,
        page_size: int = 50,
    ) -> tuple[list[Invoice], int]:
        query = select(Invoice).where(Invoice.organisation_id == org_id)
        if client_id is not None:
            query = query.where(Invoice.client_id == client_id)
        if invoice_status is not None:
            query = query.where(Invoice.status == invoice_status)
        if matter_id is not None:
            query = query.where(
                Invoice.id.in_(
                    select(InvoiceLineItem.invoice_id).where(InvoiceLineItem.matter_id == matter_id)
                )
            )

        count_query = select(func.count()).select_from(query.subquery())
        total = (await self.db.execute(count_query)).scalar_one()

        query = (
            query.options(selectinload(Invoice.line_items))
            .order_by(Invoice.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        result = await self.db.execute(query)
        return list(result.scalars().all()), total

    async def get_invoice(self, invoice_id: uuid.UUID, org_id: uuid.UUID) -> Invoice:
        return await self._get_invoice(invoice_id, org_id)

    # ── Line items ────────────────────────────────────────────────────────

    async def add_line_item(
        self, invoice_id: uuid.UUID, org_id: uuid.UUID, data: InvoiceLineItemCreate
    ) -> Invoice:
        invoice = await self._get_invoice(invoice_id, org_id)
        if invoice.status != InvoiceStatus.draft:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Cannot add line items to an invoice that is not a draft",
            )
        await self._build_line_item(org_id, invoice.id, data)
        await self.db.flush()
        await self.db.refresh(invoice, attribute_names=["line_items"])
        self._recompute_totals(invoice)
        await self.db.commit()
        await self.db.refresh(invoice, attribute_names=["line_items"])
        return invoice

    async def update_line_item(
        self,
        invoice_id: uuid.UUID,
        line_item_id: uuid.UUID,
        org_id: uuid.UUID,
        data: InvoiceLineItemUpdate,
    ) -> Invoice:
        invoice = await self._get_invoice(invoice_id, org_id)
        if invoice.status != InvoiceStatus.draft:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Cannot edit line items on an invoice that is not a draft",
            )
        line_item = next((li for li in invoice.line_items if li.id == line_item_id), None)
        if not line_item:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Line item not found")

        update_data = data.model_dump(exclude_unset=True)
        if "matter_id" in update_data and update_data["matter_id"] is not None:
            await self._validate_matter(update_data["matter_id"], org_id)
        if "fee_arrangement_id" in update_data and update_data["fee_arrangement_id"] is not None:
            effective_matter_id = update_data.get("matter_id", line_item.matter_id)
            await self._validate_fee_arrangement(update_data["fee_arrangement_id"], effective_matter_id, org_id)

        for field, value in update_data.items():
            if field == "description" and isinstance(value, str):
                value = value.strip()
            setattr(line_item, field, value)

        # Recompute amount_kobo if quantity/unit_amount changed and amount
        # wasn't explicitly supplied in this same request.
        if ("quantity" in update_data or "unit_amount_kobo" in update_data) and "amount_kobo" not in update_data:
            line_item.amount_kobo = int(line_item.quantity * line_item.unit_amount_kobo)

        self._recompute_totals(invoice)
        await self.db.commit()
        await self.db.refresh(invoice, attribute_names=["line_items"])
        return invoice

    async def delete_line_item(self, invoice_id: uuid.UUID, line_item_id: uuid.UUID, org_id: uuid.UUID) -> Invoice:
        invoice = await self._get_invoice(invoice_id, org_id)
        if invoice.status != InvoiceStatus.draft:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Cannot remove line items from an invoice that is not a draft",
            )
        line_item = next((li for li in invoice.line_items if li.id == line_item_id), None)
        if not line_item:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Line item not found")

        await self.db.delete(line_item)
        await self.db.flush()
        await self.db.refresh(invoice, attribute_names=["line_items"])
        self._recompute_totals(invoice)
        await self.db.commit()
        await self.db.refresh(invoice, attribute_names=["line_items"])
        return invoice

    # ── Update (draft-only) ───────────────────────────────────────────────

    async def update_invoice(self, invoice_id: uuid.UUID, org_id: uuid.UUID, data: UpdateInvoiceRequest) -> Invoice:
        invoice = await self._get_invoice(invoice_id, org_id)
        if invoice.status != InvoiceStatus.draft:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Only draft invoices can be edited",
            )
        update_data = data.model_dump(exclude_unset=True)

        if "client_id" in update_data:
            await self._validate_client(update_data["client_id"], org_id)

        vat_override = update_data.pop("vat_kobo", None)
        wht_override = update_data.pop("wht_kobo", None)
        tax_fields_touched = bool(
            {"vat_enabled", "wht_enabled"} & update_data.keys() or vat_override is not None or wht_override is not None
        )

        for field, value in update_data.items():
            setattr(invoice, field, value)

        if tax_fields_touched:
            self._recompute_totals(invoice, vat_override=vat_override, wht_override=wht_override)

        await self.db.commit()
        await self.db.refresh(invoice, attribute_names=["line_items"])
        return invoice

    # ── Issue ─────────────────────────────────────────────────────────────

    async def issue_invoice(self, invoice_id: uuid.UUID, org_id: uuid.UUID, actor_id: uuid.UUID) -> Invoice:
        invoice = await self._get_invoice(invoice_id, org_id)
        if invoice.status != InvoiceStatus.draft:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invoice is not a draft")
        if not invoice.line_items:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Cannot issue an invoice with no line items"
            )

        # Lock the Organisation row purely as a serialization point so two
        # concurrent issue_invoice() calls for the same org can't both
        # count the same existing number and produce a duplicate.
        await self.db.execute(select(Organisation).where(Organisation.id == org_id).with_for_update())

        year = datetime.now(timezone.utc).year
        count = (
            await self.db.execute(
                select(func.count()).select_from(Invoice).where(
                    Invoice.organisation_id == org_id,
                    Invoice.number.like(f"INV-{year}-%"),
                )
            )
        ).scalar_one()
        invoice.number = f"INV-{year}-{str(count + 1).zfill(4)}"
        invoice.status = InvoiceStatus.sent

        for matter_id in _distinct_matter_ids(invoice):
            await self.activity.log(
                matter_id=matter_id,
                org_id=org_id,
                actor_id=actor_id,
                event_type="invoice_issued",
                payload={"invoice_id": str(invoice.id), "number": invoice.number},
            )

        await self.db.commit()
        await self.db.refresh(invoice, attribute_names=["line_items"])
        return invoice

    # ── Void ──────────────────────────────────────────────────────────────

    async def void_invoice(
        self, invoice_id: uuid.UUID, org_id: uuid.UUID, actor_id: uuid.UUID, reason: str | None
    ) -> Invoice:
        invoice = await self._get_invoice(invoice_id, org_id)
        if invoice.status not in (InvoiceStatus.draft, InvoiceStatus.sent, InvoiceStatus.part_paid, InvoiceStatus.overdue):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invoice cannot be voided from its current status"
            )
        if invoice.amount_paid_kobo > 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Cannot void an invoice with recorded payments — a credit note flow is needed instead",
            )

        invoice.status = InvoiceStatus.void
        if reason:
            note = f"Voided: {reason}"
            invoice.notes = f"{invoice.notes}\n\n{note}" if invoice.notes else note

        for matter_id in _distinct_matter_ids(invoice):
            await self.activity.log(
                matter_id=matter_id,
                org_id=org_id,
                actor_id=actor_id,
                event_type="invoice_voided",
                payload={"invoice_id": str(invoice.id), "number": invoice.number, "reason": reason},
            )

        await self.db.commit()
        await self.db.refresh(invoice, attribute_names=["line_items"])
        return invoice

    # ── Mark served (Bill of Charges) ─────────────────────────────────────

    async def mark_served(
        self, invoice_id: uuid.UUID, org_id: uuid.UUID, served_at: datetime | None
    ) -> Invoice:
        invoice = await self._get_invoice(invoice_id, org_id)
        if not invoice.is_bill_of_charges:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Invoice is not marked as a Bill of Charges",
            )
        if invoice.status == InvoiceStatus.draft:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Cannot mark a draft invoice as served"
            )
        invoice.served_at = served_at or datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(invoice, attribute_names=["line_items"])
        return invoice

    # ── PDF ───────────────────────────────────────────────────────────────

    async def render_pdf(self, invoice_id: uuid.UUID, org_id: uuid.UUID) -> bytes:
        invoice = await self._get_invoice(invoice_id, org_id)

        org_result = await self.db.execute(select(Organisation).where(Organisation.id == org_id))
        organisation = org_result.scalar_one()
        client_result = await self.db.execute(select(Client).where(Client.id == invoice.client_id))
        client = client_result.scalar_one()

        matter_ids = _distinct_matter_ids(invoice)
        matter_titles: list[str] = []
        matters_by_id: dict[uuid.UUID, Matter] = {}
        if matter_ids:
            matters_result = await self.db.execute(select(Matter).where(Matter.id.in_(matter_ids)))
            for matter in matters_result.scalars().all():
                matters_by_id[matter.id] = matter
                matter_titles.append(matter.title)

        line_items = [
            {
                "description": item.description,
                "matter_title": matters_by_id[item.matter_id].title if item.matter_id in matters_by_id else None,
                "quantity": item.quantity,
                "unit_amount_display": _format_kobo(item.unit_amount_kobo, invoice.currency),
                "amount_display": _format_kobo(item.amount_kobo, invoice.currency),
            }
            for item in invoice.line_items
        ]

        balance_due_kobo = invoice.net_payable_kobo - invoice.amount_paid_kobo
        totals = {
            "subtotal_display": _format_kobo(invoice.subtotal_kobo, invoice.currency),
            "disbursements_display": _format_kobo(invoice.disbursements_kobo, invoice.currency),
            "vat_display": _format_kobo(invoice.vat_kobo, invoice.currency),
            "total_display": _format_kobo(invoice.total_kobo, invoice.currency),
            "wht_display": _format_kobo(invoice.wht_kobo, invoice.currency),
            "net_payable_display": _format_kobo(invoice.net_payable_kobo, invoice.currency),
            "amount_paid_display": _format_kobo(invoice.amount_paid_kobo, invoice.currency),
            "balance_due_display": _format_kobo(balance_due_kobo, invoice.currency),
        }

        template = self.jinja_env.get_template("invoice.html")
        html = template.render(
            organisation=organisation,
            client=client,
            invoice={
                "number": invoice.number,
                "status": invoice.status.value,
                "issue_date": invoice.issue_date,
                "due_date": invoice.due_date,
                "currency": invoice.currency,
                "vat_enabled": invoice.vat_enabled,
                "wht_enabled": invoice.wht_enabled,
                "notes": invoice.notes,
                "is_bill_of_charges": invoice.is_bill_of_charges,
                "served_at": invoice.served_at,
            },
            matter_titles=matter_titles,
            line_items=line_items,
            totals=totals,
        )

        buffer = BytesIO()
        result = pisa.CreatePDF(html, dest=buffer)
        if result.err:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to render invoice PDF")
        return buffer.getvalue()
