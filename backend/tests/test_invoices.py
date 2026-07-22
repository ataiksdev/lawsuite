# backend/tests/test_invoices.py
from datetime import date, timedelta

import pytest
from httpx import AsyncClient

from app.core.security import create_access_token

REGISTER = {
    "org_name": "Invoice Test Firm",
    "full_name": "Bola Adewale",
    "email": "bola@invoicetest.ng",
    "password": "TestPass123",
}


async def setup_two_matters(client: AsyncClient) -> tuple[str, str, str, str]:
    """Register, create a corporate client + two matters, return (token, client_id, matter_a_id, matter_b_id)."""
    reg = await client.post("/auth/register", json=REGISTER)
    token = reg.json()["tokens"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    cl = await client.post(
        "/clients/", json={"name": "Multi Matter Client", "client_type": "corporate"}, headers=headers
    )
    client_id = cl.json()["id"]
    m_a = await client.post(
        "/matters/", json={"title": "Matter A", "matter_type": "litigation", "client_id": client_id}, headers=headers
    )
    m_b = await client.post(
        "/matters/", json={"title": "Matter B", "matter_type": "compliance", "client_id": client_id}, headers=headers
    )
    return token, client_id, m_a.json()["id"], m_b.json()["id"]


@pytest.mark.asyncio
async def test_draft_invoice_spans_multiple_matters_and_matterless_line(client: AsyncClient):
    token, client_id, matter_a_id, matter_b_id = await setup_two_matters(client)
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post(
        "/invoices",
        json={
            "client_id": client_id,
            "line_items": [
                {
                    "kind": "professional_fee",
                    "description": "Matter A fees",
                    "unit_amount_kobo": 500_000,
                    "matter_id": matter_a_id,
                },
                {
                    "kind": "professional_fee",
                    "description": "Matter B fees",
                    "unit_amount_kobo": 300_000,
                    "matter_id": matter_b_id,
                },
                {
                    "kind": "professional_fee",
                    "description": "Firm-level retainer",
                    "unit_amount_kobo": 100_000,
                },
            ],
        },
        headers=headers,
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "draft"
    assert body["number"] is None
    assert set(body["matter_ids"]) == {matter_a_id, matter_b_id}
    assert body["subtotal_kobo"] == 900_000
    # corporate client -> wht_enabled defaults True
    assert body["wht_enabled"] is True

    # GET /invoices?matter_id=X returns it via the derived subquery.
    listing = await client.get(f"/invoices?matter_id={matter_a_id}", headers=headers)
    assert listing.status_code == 200
    assert any(inv["id"] == body["id"] for inv in listing.json()["items"])


@pytest.mark.asyncio
async def test_issue_assigns_sequential_number_and_requires_line_items(client: AsyncClient):
    token, client_id, matter_a_id, _ = await setup_two_matters(client)
    headers = {"Authorization": f"Bearer {token}"}

    empty_draft = await client.post("/invoices", json={"client_id": client_id}, headers=headers)
    empty_issue = await client.post(f"/invoices/{empty_draft.json()['id']}/issue", headers=headers)
    assert empty_issue.status_code == 422

    draft1 = await client.post(
        "/invoices",
        json={
            "client_id": client_id,
            "line_items": [
                {"kind": "professional_fee", "description": "Fee 1", "unit_amount_kobo": 1_000_000, "matter_id": matter_a_id}
            ],
        },
        headers=headers,
    )
    issue1 = await client.post(f"/invoices/{draft1.json()['id']}/issue", headers=headers)
    assert issue1.status_code == 200
    year = date.today().year
    assert issue1.json()["number"] == f"INV-{year}-0001"
    assert issue1.json()["status"] == "sent"

    draft2 = await client.post(
        "/invoices",
        json={
            "client_id": client_id,
            "line_items": [
                {"kind": "professional_fee", "description": "Fee 2", "unit_amount_kobo": 2_000_000, "matter_id": matter_a_id}
            ],
        },
        headers=headers,
    )
    issue2 = await client.post(f"/invoices/{draft2.json()['id']}/issue", headers=headers)
    assert issue2.json()["number"] == f"INV-{year}-0002"

    # Line items can no longer be edited once issued.
    line_item_id = issue1.json()["line_items"][0]["id"]
    edit_resp = await client.patch(
        f"/invoices/{draft1.json()['id']}/line-items/{line_item_id}",
        json={"description": "Changed"},
        headers=headers,
    )
    assert edit_resp.status_code == 422


@pytest.mark.asyncio
async def test_wht_default_differs_corporate_vs_individual_under_safe_harbour(client: AsyncClient):
    reg = await client.post("/auth/register", json=REGISTER)
    token = reg.json()["tokens"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    individual = await client.post(
        "/clients/", json={"name": "Individual Client", "client_type": "individual"}, headers=headers
    )
    draft = await client.post("/invoices", json={"client_id": individual.json()["id"]}, headers=headers)
    # Under the NGN 2,000,000 safe harbour with no prior invoices this month.
    assert draft.json()["wht_enabled"] is False

    corporate = await client.post(
        "/clients/", json={"name": "Corporate Client", "client_type": "corporate"}, headers=headers
    )
    draft2 = await client.post("/invoices", json={"client_id": corporate.json()["id"]}, headers=headers)
    assert draft2.json()["wht_enabled"] is True


@pytest.mark.asyncio
async def test_vat_kobo_override_survives_until_next_line_item_mutation(client: AsyncClient):
    token, client_id, matter_a_id, _ = await setup_two_matters(client)
    headers = {"Authorization": f"Bearer {token}"}

    draft = await client.post(
        "/invoices",
        json={
            "client_id": client_id,
            "line_items": [
                {"kind": "professional_fee", "description": "Fee", "unit_amount_kobo": 1_000_000, "matter_id": matter_a_id}
            ],
        },
        headers=headers,
    )
    invoice_id = draft.json()["id"]
    computed_vat = draft.json()["vat_kobo"]
    assert computed_vat == 75_000  # 7.5% of 1_000_000

    override = await client.patch(f"/invoices/{invoice_id}", json={"vat_kobo": 12_345}, headers=headers)
    assert override.json()["vat_kobo"] == 12_345
    # total_kobo reflects the override, not silently recomputed.
    assert override.json()["total_kobo"] == 1_000_000 + 12_345

    # Adding another line item recomputes vat_kobo away from the override.
    add_item = await client.post(
        f"/invoices/{invoice_id}/line-items",
        json={"kind": "professional_fee", "description": "Fee 2", "unit_amount_kobo": 500_000, "matter_id": matter_a_id},
        headers=headers,
    )
    assert add_item.json()["vat_kobo"] == 112_500  # 7.5% of 1_500_000, recomputed


@pytest.mark.asyncio
async def test_void_blocked_once_payment_recorded(client: AsyncClient):
    token, client_id, matter_a_id, _ = await setup_two_matters(client)
    headers = {"Authorization": f"Bearer {token}"}

    draft = await client.post(
        "/invoices",
        json={
            "client_id": client_id,
            "line_items": [
                {"kind": "professional_fee", "description": "Fee", "unit_amount_kobo": 1_000_000, "matter_id": matter_a_id}
            ],
        },
        headers=headers,
    )
    issued = await client.post(f"/invoices/{draft.json()['id']}/issue", headers=headers)
    invoice_id = issued.json()["id"]

    await client.post(
        "/invoice-payments",
        json={
            "invoice_id": invoice_id,
            "amount_kobo": 1000,
            "method": "cash",
            "paid_at": "2026-07-20T10:00:00Z",
            "reference": "VOID-TEST-REF",
        },
        headers=headers,
    )

    void_resp = await client.post(f"/invoices/{invoice_id}/void", json={"reason": "test"}, headers=headers)
    assert void_resp.status_code == 422


@pytest.mark.asyncio
async def test_pdf_returns_valid_response(client: AsyncClient):
    token, client_id, matter_a_id, _ = await setup_two_matters(client)
    headers = {"Authorization": f"Bearer {token}"}

    draft = await client.post(
        "/invoices",
        json={
            "client_id": client_id,
            "line_items": [
                {"kind": "professional_fee", "description": "Fee", "unit_amount_kobo": 1_000_000, "matter_id": matter_a_id}
            ],
        },
        headers=headers,
    )
    resp = await client.get(f"/invoices/{draft.json()['id']}/pdf", headers=headers)
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert len(resp.content) > 500


@pytest.mark.asyncio
async def test_mark_served_requires_bill_of_charges_flag_and_computes_eligible_date(client: AsyncClient):
    token, client_id, matter_a_id, _ = await setup_two_matters(client)
    headers = {"Authorization": f"Bearer {token}"}

    non_boc_draft = await client.post(
        "/invoices",
        json={
            "client_id": client_id,
            "line_items": [
                {"kind": "professional_fee", "description": "Fee", "unit_amount_kobo": 1_000_000, "matter_id": matter_a_id}
            ],
        },
        headers=headers,
    )
    non_boc_issued = await client.post(f"/invoices/{non_boc_draft.json()['id']}/issue", headers=headers)
    non_boc_mark = await client.post(
        f"/invoices/{non_boc_issued.json()['id']}/mark-served", json={}, headers=headers
    )
    assert non_boc_mark.status_code == 422

    boc_draft = await client.post(
        "/invoices",
        json={
            "client_id": client_id,
            "is_bill_of_charges": True,
            "line_items": [
                {"kind": "professional_fee", "description": "Fee", "unit_amount_kobo": 1_000_000, "matter_id": matter_a_id}
            ],
        },
        headers=headers,
    )
    boc_issued = await client.post(f"/invoices/{boc_draft.json()['id']}/issue", headers=headers)
    served_at = "2026-07-01T00:00:00Z"
    boc_mark = await client.post(
        f"/invoices/{boc_issued.json()['id']}/mark-served", json={"served_at": served_at}, headers=headers
    )
    assert boc_mark.status_code == 200
    assert boc_mark.json()["eligible_to_sue_date"] == "2026-07-31"  # 30 days after 2026-07-01


@pytest.mark.asyncio
async def test_non_admin_member_blocked_from_all_invoicing_routes(client: AsyncClient):
    """Invoicing is admin-only, view included — a member-role user (not just
    viewer) must be blocked everywhere across all 4 routers."""
    token, client_id, matter_a_id, _ = await setup_two_matters(client)
    admin_headers = {"Authorization": f"Bearer {token}"}

    me = await client.get("/auth/me", headers=admin_headers)
    user_id = me.json()["id"]
    org = await client.get("/auth/organisation", headers=admin_headers)
    org_id = org.json()["id"]

    member_token = create_access_token(subject=user_id, org_id=org_id, role="member")
    member_headers = {"Authorization": f"Bearer {member_token}"}

    list_resp = await client.get("/invoices", headers=member_headers)
    assert list_resp.status_code == 403

    dashboard_resp = await client.get("/invoices/dashboard-summary", headers=member_headers)
    assert dashboard_resp.status_code == 403

    create_resp = await client.post("/invoices", json={"client_id": client_id}, headers=member_headers)
    assert create_resp.status_code == 403

    fee_arrangement_resp = await client.get(
        f"/matters/{matter_a_id}/fee-arrangements", headers=member_headers
    )
    assert fee_arrangement_resp.status_code == 403

    disbursement_resp = await client.get(
        f"/matters/{matter_a_id}/disbursements", headers=member_headers
    )
    assert disbursement_resp.status_code == 403

    payment_resp = await client.get(
        "/invoice-payments", params={"invoice_id": matter_a_id}, headers=member_headers
    )
    assert payment_resp.status_code == 403


@pytest.mark.asyncio
async def test_overdue_sweep_flips_sent_invoice_past_due_date(client: AsyncClient, db_session):
    """The Celery beat sweep (InvoiceService.mark_overdue_invoices) should
    flip a sent invoice to overdue once its due_date has passed, and must
    leave invoices with no due_date or a future due_date untouched."""
    token, client_id, matter_a_id, _ = await setup_two_matters(client)
    headers = {"Authorization": f"Bearer {token}"}
    past_due = (date.today() - timedelta(days=5)).isoformat()

    draft = await client.post(
        "/invoices",
        json={
            "client_id": client_id,
            "due_date": past_due,
            "line_items": [
                {
                    "kind": "professional_fee",
                    "description": "Overdue test fee",
                    "unit_amount_kobo": 100_000,
                    "matter_id": matter_a_id,
                }
            ],
        },
        headers=headers,
    )
    invoice_id = draft.json()["id"]
    issued = await client.post(f"/invoices/{invoice_id}/issue", headers=headers)
    assert issued.json()["status"] == "sent"

    from sqlalchemy import text

    from app.services.invoice_service import InvoiceService

    await db_session.execute(text("SELECT set_config('app.bypass_rls', 'on', false)"))
    updated_count = await InvoiceService(db_session).mark_overdue_invoices()
    assert updated_count >= 1

    check = await client.get(f"/invoices/{invoice_id}", headers=headers)
    assert check.json()["status"] == "overdue"


@pytest.mark.asyncio
async def test_dashboard_summary_totals_and_attention_list(client: AsyncClient):
    token, client_id, matter_a_id, _ = await setup_two_matters(client)
    headers = {"Authorization": f"Bearer {token}"}

    async def create_invoice(amount_kobo: int) -> str:
        draft = await client.post(
            "/invoices",
            json={
                "client_id": client_id,
                "line_items": [
                    {
                        "kind": "professional_fee",
                        "description": "Dashboard test fee",
                        "unit_amount_kobo": amount_kobo,
                        "matter_id": matter_a_id,
                    }
                ],
            },
            headers=headers,
        )
        return draft.json()["id"]

    # Draft — contributes to expected_kobo only.
    draft_id = await create_invoice(1_000_000)
    draft_invoice = (await client.get(f"/invoices/{draft_id}", headers=headers)).json()

    # Sent, unpaid — contributes to outstanding_kobo and the attention list.
    sent_id = await create_invoice(2_000_000)
    sent_invoice = (await client.post(f"/invoices/{sent_id}/issue", headers=headers)).json()

    # Sent, then fully paid today — contributes to paid_this_month_kobo, not outstanding.
    paid_id = await create_invoice(500_000)
    paid_invoice = (await client.post(f"/invoices/{paid_id}/issue", headers=headers)).json()
    await client.post(
        "/invoice-payments",
        json={
            "invoice_id": paid_id,
            "amount_kobo": paid_invoice["net_payable_kobo"],
            "method": "bank_transfer",
            "paid_at": "2026-07-22T10:00:00Z",
            "reference": f"DASH-{paid_id[:8]}",
        },
        headers=headers,
    )

    summary = (await client.get("/invoices/dashboard-summary", headers=headers)).json()

    assert summary["status_counts"].get("draft", 0) >= 1
    assert summary["status_counts"].get("sent", 0) >= 1
    assert summary["status_counts"].get("paid", 0) >= 1

    assert summary["expected_kobo"] >= draft_invoice["net_payable_kobo"]
    assert summary["outstanding_kobo"] >= sent_invoice["net_payable_kobo"]
    assert summary["paid_this_month_kobo"] >= paid_invoice["net_payable_kobo"]

    attention_ids = {item["id"] for item in summary["attention_items"]}
    assert sent_id in attention_ids
    assert draft_id not in attention_ids
    assert paid_id not in attention_ids
