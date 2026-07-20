# backend/tests/test_invoice_payments.py
import pytest
from httpx import AsyncClient

REGISTER = {
    "org_name": "Payment Test Firm",
    "full_name": "Kemi Afolabi",
    "email": "kemi@paytest.ng",
    "password": "TestPass123",
}

OTHER_REGISTER = {
    "org_name": "Other Payment Firm",
    "full_name": "Ngozi Chukwu",
    "email": "ngozi@otherpaytest.ng",
    "password": "TestPass123",
}


async def setup_issued_invoice(client: AsyncClient, register: dict = REGISTER) -> tuple[str, str]:
    """Register, create client/matter, draft+issue an invoice. Returns (token, invoice_id)."""
    reg = await client.post("/auth/register", json=register)
    token = reg.json()["tokens"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    cl = await client.post("/clients/", json={"name": "Payment Test Client"}, headers=headers)
    m = await client.post(
        "/matters/",
        json={"title": "Payment Matter", "matter_type": "litigation", "client_id": cl.json()["id"]},
        headers=headers,
    )
    draft = await client.post(
        "/invoices",
        json={
            "client_id": cl.json()["id"],
            "vat_enabled": False,
            "line_items": [
                {
                    "kind": "professional_fee",
                    "description": "Fee",
                    "unit_amount_kobo": 1_000_000,
                    "matter_id": m.json()["id"],
                    "is_vatable": False,
                }
            ],
        },
        headers=headers,
    )
    issued = await client.post(f"/invoices/{draft.json()['id']}/issue", headers=headers)
    return token, issued.json()["id"]


@pytest.mark.asyncio
async def test_full_payment_flips_paid(client: AsyncClient):
    token, invoice_id = await setup_issued_invoice(client)
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post(
        "/invoice-payments",
        json={
            "invoice_id": invoice_id,
            "amount_kobo": 1_000_000,
            "method": "bank_transfer",
            "paid_at": "2026-07-20T10:00:00Z",
            "reference": "FULL-PAY-REF",
        },
        headers=headers,
    )
    assert resp.status_code == 201

    invoice = await client.get(f"/invoices/{invoice_id}", headers=headers)
    assert invoice.json()["status"] == "paid"
    assert invoice.json()["amount_paid_kobo"] == 1_000_000


@pytest.mark.asyncio
async def test_partial_payment_flips_part_paid(client: AsyncClient):
    token, invoice_id = await setup_issued_invoice(client)
    headers = {"Authorization": f"Bearer {token}"}

    await client.post(
        "/invoice-payments",
        json={
            "invoice_id": invoice_id,
            "amount_kobo": 400_000,
            "method": "cash",
            "paid_at": "2026-07-20T10:00:00Z",
            "reference": "PARTIAL-PAY-REF",
        },
        headers=headers,
    )
    invoice = await client.get(f"/invoices/{invoice_id}", headers=headers)
    assert invoice.json()["status"] == "part_paid"
    assert invoice.json()["amount_paid_kobo"] == 400_000


@pytest.mark.asyncio
async def test_replaying_same_reference_is_a_true_noop(client: AsyncClient):
    token, invoice_id = await setup_issued_invoice(client)
    headers = {"Authorization": f"Bearer {token}"}

    payload = {
        "invoice_id": invoice_id,
        "amount_kobo": 400_000,
        "method": "cheque",
        "paid_at": "2026-07-20T10:00:00Z",
        "reference": "IDEMPOTENT-REF",
    }
    first = await client.post("/invoice-payments", json=payload, headers=headers)
    second = await client.post("/invoice-payments", json=payload, headers=headers)

    assert first.json()["id"] == second.json()["id"]

    invoice = await client.get(f"/invoices/{invoice_id}", headers=headers)
    # Not double-credited — still only 400_000, not 800_000.
    assert invoice.json()["amount_paid_kobo"] == 400_000


@pytest.mark.asyncio
async def test_two_orgs_can_reuse_the_same_reference_string(client: AsyncClient):
    token_a, invoice_id_a = await setup_issued_invoice(client, REGISTER)
    token_b, invoice_id_b = await setup_issued_invoice(client, OTHER_REGISTER)

    payload_a = {
        "invoice_id": invoice_id_a,
        "amount_kobo": 500_000,
        "method": "bank_transfer",
        "paid_at": "2026-07-20T10:00:00Z",
        "reference": "SHARED-REF-001",
    }
    payload_b = {**payload_a, "invoice_id": invoice_id_b}

    resp_a = await client.post(
        "/invoice-payments", json=payload_a, headers={"Authorization": f"Bearer {token_a}"}
    )
    resp_b = await client.post(
        "/invoice-payments", json=payload_b, headers={"Authorization": f"Bearer {token_b}"}
    )
    assert resp_a.status_code == 201
    assert resp_b.status_code == 201
    assert resp_a.json()["id"] != resp_b.json()["id"]


@pytest.mark.asyncio
async def test_zero_amount_payment_rejected_by_schema(client: AsyncClient):
    token, invoice_id = await setup_issued_invoice(client)
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post(
        "/invoice-payments",
        json={
            "invoice_id": invoice_id,
            "amount_kobo": 0,
            "method": "cash",
            "paid_at": "2026-07-20T10:00:00Z",
            "reference": "ZERO-REF",
        },
        headers=headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_recording_against_draft_invoice_rejected(client: AsyncClient):
    reg = await client.post("/auth/register", json=REGISTER)
    token = reg.json()["tokens"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    cl = await client.post("/clients/", json={"name": "Draft Payment Client"}, headers=headers)
    draft = await client.post("/invoices", json={"client_id": cl.json()["id"]}, headers=headers)

    resp = await client.post(
        "/invoice-payments",
        json={
            "invoice_id": draft.json()["id"],
            "amount_kobo": 100_000,
            "method": "cash",
            "paid_at": "2026-07-20T10:00:00Z",
            "reference": "DRAFT-REF",
        },
        headers=headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_activity_log_created_per_matter(client: AsyncClient, db_session):
    from sqlalchemy import select

    from app.models.activity_log import ActivityLog

    token, invoice_id = await setup_issued_invoice(client)
    headers = {"Authorization": f"Bearer {token}"}

    await client.post(
        "/invoice-payments",
        json={
            "invoice_id": invoice_id,
            "amount_kobo": 1_000_000,
            "method": "bank_transfer",
            "paid_at": "2026-07-20T10:00:00Z",
            "reference": "ACTIVITY-REF",
        },
        headers=headers,
    )

    result = await db_session.execute(
        select(ActivityLog).where(ActivityLog.event_type == "invoice_payment_recorded")
    )
    entries = result.scalars().all()
    assert len(entries) == 1
