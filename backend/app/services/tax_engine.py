# backend/app/services/tax_engine.py
"""
Nigerian client-invoicing tax engine.

VAT: 7.5% flat (Nigeria Tax Act 2025, effective 1 Jan 2026 — confirmed
     unchanged from the prior rate). Applies to professional fees and
     "recharge" disbursements. "Agency" disbursements (court filing fees,
     stamp duty, CAC fees — pass-through third-party costs) are NOT vatable.

WHT: 5% on professional fees, under the Deduction of Tax at Source
     (Withholding) Regulations 2024. The CLIENT withholds this at payment
     time and remits it to the NRS in the firm's name — the firm never
     receives that portion, and is owed a WHT credit note for it.

     Safe harbour: individual / unincorporated clients are not required to
     withhold if total transactions with this firm in the calendar month
     are <= NGN 2,000,000.

     [VERIFY before production use: rate, safe-harbour figure, and which
     client/matter combinations are exempt, with a Nigerian tax adviser.
     Rates below are best-effort as of this build; tax rules change — do
     not treat this module as a substitute for that check.]

Pure functions only — no DB access, no FastAPI imports. Whether VAT/WHT are
actually applied to a given invoice (the on/off toggle, and any manual
override of the computed amount) is decided in app.services.invoice_service,
not here — this module only answers "what would the recommended amount be."
"""
from decimal import ROUND_HALF_UP, Decimal
from typing import NamedTuple, Sequence

VAT_RATE = Decimal("0.075")
WHT_RATE_PROFESSIONAL_FEES = Decimal("0.05")
WHT_SAFE_HARBOUR_MONTHLY_KOBO = 2_000_000 * 100  # NGN 2,000,000


class LineItemInput(NamedTuple):
    kind: str            # "professional_fee" | "disbursement" | "expense"
    amount_kobo: int
    is_vatable: bool
    is_wht_applicable: bool


class InvoiceTotals(NamedTuple):
    subtotal_kobo: int
    vat_kobo: int
    disbursements_kobo: int
    total_kobo: int
    wht_kobo: int
    net_payable_kobo: int


def _round_kobo(value: Decimal) -> int:
    return int(value.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def wht_applies(client_type: str, month_to_date_total_kobo: int) -> bool:
    """
    client_type: "individual" | "corporate" (see Client.client_type).
    month_to_date_total_kobo: sum of this client's invoiced amounts with
    this firm in the current calendar month, BEFORE this invoice — caller
    computes this from existing invoices, not this function's job.
    """
    if client_type == "corporate":
        return True
    return month_to_date_total_kobo > WHT_SAFE_HARBOUR_MONTHLY_KOBO


def compute_invoice_totals(
    line_items: Sequence[LineItemInput],
    wht_applicable: bool,
) -> InvoiceTotals:
    subtotal = sum(li.amount_kobo for li in line_items if li.kind == "professional_fee")
    disbursements = sum(li.amount_kobo for li in line_items if li.kind in ("disbursement", "expense"))

    vatable_base = sum(li.amount_kobo for li in line_items if li.is_vatable)
    vat = _round_kobo(Decimal(vatable_base) * VAT_RATE)

    total = subtotal + disbursements + vat

    wht_base = sum(
        li.amount_kobo for li in line_items
        if li.kind == "professional_fee" and li.is_wht_applicable
    )
    wht = _round_kobo(Decimal(wht_base) * WHT_RATE_PROFESSIONAL_FEES) if wht_applicable else 0

    net_payable = total - wht

    return InvoiceTotals(
        subtotal_kobo=subtotal,
        vat_kobo=vat,
        disbursements_kobo=disbursements,
        total_kobo=total,
        wht_kobo=wht,
        net_payable_kobo=net_payable,
    )
