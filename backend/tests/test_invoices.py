# backend/tests/test_invoices.py
from datetime import date, timedelta

import pytest
from httpx import AsyncClient

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
