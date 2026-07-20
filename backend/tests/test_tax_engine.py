# backend/tests/test_tax_engine.py
"""
Pure unit tests for app.services.tax_engine — no DB, no fixtures.
"""
from decimal import Decimal

from app.services.tax_engine import (
    WHT_SAFE_HARBOUR_MONTHLY_KOBO,
    LineItemInput,
    compute_invoice_totals,
    wht_applies,
)


def test_vat_only_no_wht():
    line_items = [
        LineItemInput(kind="professional_fee", amount_kobo=1_000_000, is_vatable=True, is_wht_applicable=True),
    ]
    totals = compute_invoice_totals(line_items, wht_applicable=False)

    assert totals.subtotal_kobo == 1_000_000
    assert totals.vat_kobo == 75_000  # 7.5%
    assert totals.disbursements_kobo == 0
    assert totals.total_kobo == 1_075_000
    assert totals.wht_kobo == 0
    assert totals.net_payable_kobo == 1_075_000


def test_vat_and_wht_corporate():
    line_items = [
        LineItemInput(kind="professional_fee", amount_kobo=1_000_000, is_vatable=True, is_wht_applicable=True),
    ]
    assert wht_applies("corporate", month_to_date_total_kobo=0) is True

    totals = compute_invoice_totals(line_items, wht_applicable=True)
    assert totals.vat_kobo == 75_000
    assert totals.wht_kobo == 50_000  # 5%
    assert totals.total_kobo == 1_075_000
    assert totals.net_payable_kobo == 1_025_000


def test_wht_individual_under_safe_harbour_does_not_apply():
    assert wht_applies("individual", month_to_date_total_kobo=WHT_SAFE_HARBOUR_MONTHLY_KOBO) is False
    assert wht_applies("individual", month_to_date_total_kobo=WHT_SAFE_HARBOUR_MONTHLY_KOBO - 1) is False


def test_wht_individual_over_safe_harbour_applies():
    assert wht_applies("individual", month_to_date_total_kobo=WHT_SAFE_HARBOUR_MONTHLY_KOBO + 1) is True


def test_agency_disbursement_excluded_from_vat_recharge_included():
    line_items = [
        LineItemInput(kind="professional_fee", amount_kobo=1_000_000, is_vatable=True, is_wht_applicable=True),
        # agency: not vatable, not wht-applicable (it's not a professional_fee kind anyway)
        LineItemInput(kind="disbursement", amount_kobo=200_000, is_vatable=False, is_wht_applicable=False),
        # recharge: vatable
        LineItemInput(kind="expense", amount_kobo=100_000, is_vatable=True, is_wht_applicable=False),
    ]
    totals = compute_invoice_totals(line_items, wht_applicable=False)

    assert totals.subtotal_kobo == 1_000_000
    assert totals.disbursements_kobo == 300_000  # 200_000 + 100_000
    # VAT base = professional_fee (1_000_000) + recharge expense (100_000) = 1_100_000
    assert totals.vat_kobo == 82_500  # 7.5% of 1_100_000
    assert totals.total_kobo == 1_382_500


def test_rounding_half_up_boundary():
    # 33 kobo * 7.5% = 2.475 -> rounds to 2 under normal rounding, but
    # ROUND_HALF_UP on .5 boundaries specifically: pick an amount that
    # lands exactly on a .5 kobo boundary to exercise the rounding mode.
    # 100 kobo * 7.5% = 7.5 exactly -> ROUND_HALF_UP -> 8
    line_items = [
        LineItemInput(kind="professional_fee", amount_kobo=100, is_vatable=True, is_wht_applicable=False),
    ]
    totals = compute_invoice_totals(line_items, wht_applicable=False)
    assert totals.vat_kobo == 8
    assert Decimal(100) * Decimal("0.075") == Decimal("7.500")
