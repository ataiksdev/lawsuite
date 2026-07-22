# backend/tests/test_idempotency_and_deletes.py
"""
Covers two related fixes:
  1. Idempotency keys on Client/Task/Matter/Invoice creation — a retried
     request (e.g. after a network error) returns the original row instead
     of creating a duplicate.
  2. Deleting empty Invoices/Clients (hard delete, audit-logged) vs. the
     existing behaviour for non-empty records (void / archive).
"""
import pytest
from httpx import AsyncClient

from app.core.security import create_access_token

REGISTER = {
    "org_name": "Idempotency Test Firm",
    "full_name": "Tolu Bankole",
    "email": "tolu@idempotencytest.ng",
    "password": "TestPass123",
}


async def setup(client: AsyncClient) -> tuple[str, str, str]:
    """Register, create a client + matter. Return (token, client_id, matter_id)."""
    reg = await client.post("/auth/register", json=REGISTER)
    token = reg.json()["tokens"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    cl = await client.post("/clients/", json={"name": "Idempotency Client"}, headers=headers)
    client_id = cl.json()["id"]

    m = await client.post(
        "/matters/",
        json={"title": "Idempotency Matter", "matter_type": "advisory", "client_id": client_id},
        headers=headers,
    )
    return token, client_id, m.json()["id"]


# ─── Idempotency keys ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_client_create_idempotency_key_returns_same_row(client: AsyncClient):
    token, _, _ = await setup(client)
    headers = {"Authorization": f"Bearer {token}"}
    key = "client-retry-key-1"

    first = await client.post(
        "/clients/", json={"name": "Retry Client", "idempotency_key": key}, headers=headers
    )
    second = await client.post(
        "/clients/", json={"name": "Retry Client (retry)", "idempotency_key": key}, headers=headers
    )
    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["id"] == second.json()["id"]
    assert second.json()["name"] == "Retry Client"  # original name, not the retry's payload

    listing = await client.get("/clients/", params={"search": "Retry Client"}, headers=headers)
    assert listing.json()["total"] == 1


@pytest.mark.asyncio
async def test_task_create_idempotency_key_returns_same_row(client: AsyncClient):
    token, _, matter_id = await setup(client)
    headers = {"Authorization": f"Bearer {token}"}
    key = "task-retry-key-1"

    first = await client.post(
        f"/matters/{matter_id}/tasks",
        json={"title": "Retry Task", "idempotency_key": key},
        headers=headers,
    )
    second = await client.post(
        f"/matters/{matter_id}/tasks",
        json={"title": "Retry Task (retry)", "idempotency_key": key},
        headers=headers,
    )
    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["id"] == second.json()["id"]

    listing = await client.get(f"/matters/{matter_id}/tasks", headers=headers)
    assert len(listing.json()["items"]) == 1


@pytest.mark.asyncio
async def test_matter_create_idempotency_key_returns_same_row(client: AsyncClient):
    reg = await client.post("/auth/register", json=REGISTER)
    token = reg.json()["tokens"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    cl = await client.post("/clients/", json={"name": "Matter Retry Client"}, headers=headers)
    client_id = cl.json()["id"]
    key = "matter-retry-key-1"

    first = await client.post(
        "/matters/",
        json={"title": "Retry Matter", "matter_type": "advisory", "client_id": client_id, "idempotency_key": key},
        headers=headers,
    )
    second = await client.post(
        "/matters/",
        json={
            "title": "Retry Matter (retry)",
            "matter_type": "advisory",
            "client_id": client_id,
            "idempotency_key": key,
        },
        headers=headers,
    )
    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["id"] == second.json()["id"]
    assert first.json()["reference_no"] == second.json()["reference_no"]  # no reference burned on retry


@pytest.mark.asyncio
async def test_invoice_create_idempotency_key_returns_same_row(client: AsyncClient):
    token, client_id, _ = await setup(client)
    headers = {"Authorization": f"Bearer {token}"}
    key = "invoice-retry-key-1"

    first = await client.post(
        "/invoices", json={"client_id": client_id, "idempotency_key": key}, headers=headers
    )
    second = await client.post(
        "/invoices", json={"client_id": client_id, "idempotency_key": key}, headers=headers
    )
    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["id"] == second.json()["id"]


# ─── Invoice delete (empty drafts only) ────────────────────────────────────────


@pytest.mark.asyncio
async def test_delete_empty_draft_invoice_succeeds(client: AsyncClient):
    token, client_id, _ = await setup(client)
    headers = {"Authorization": f"Bearer {token}"}

    draft = await client.post("/invoices", json={"client_id": client_id}, headers=headers)
    invoice_id = draft.json()["id"]

    delete_resp = await client.delete(f"/invoices/{invoice_id}", headers=headers)
    assert delete_resp.status_code == 204

    get_resp = await client.get(f"/invoices/{invoice_id}", headers=headers)
    assert get_resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_invoice_rejected_when_not_empty_or_not_draft(client: AsyncClient):
    token, client_id, matter_id = await setup(client)
    headers = {"Authorization": f"Bearer {token}"}

    with_line_item = await client.post(
        "/invoices",
        json={
            "client_id": client_id,
            "line_items": [
                {
                    "kind": "professional_fee",
                    "description": "Non-empty",
                    "unit_amount_kobo": 100_000,
                    "matter_id": matter_id,
                }
            ],
        },
        headers=headers,
    )
    invoice_id = with_line_item.json()["id"]
    resp = await client.delete(f"/invoices/{invoice_id}", headers=headers)
    assert resp.status_code == 422

    issued_draft = await client.post("/invoices", json={"client_id": client_id}, headers=headers)
    issued_id = issued_draft.json()["id"]
    await client.post(
        f"/invoices/{issued_id}/line-items",
        json={
            "kind": "professional_fee",
            "description": "For issuing",
            "unit_amount_kobo": 100_000,
            "matter_id": matter_id,
        },
        headers=headers,
    )
    issued = await client.post(f"/invoices/{issued_id}/issue", headers=headers)
    assert issued.json()["status"] == "sent"
    resp2 = await client.delete(f"/invoices/{issued_id}", headers=headers)
    assert resp2.status_code == 422


# ─── Client delete (empty → hard delete, else archive) ─────────────────────────


@pytest.mark.asyncio
async def test_delete_empty_client_hard_deletes_with_audit_log(client: AsyncClient):
    reg = await client.post("/auth/register", json=REGISTER)
    token = reg.json()["tokens"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    cl = await client.post("/clients/", json={"name": "Empty Client"}, headers=headers)
    client_id = cl.json()["id"]

    delete_resp = await client.delete(f"/clients/{client_id}", headers=headers)
    assert delete_resp.status_code == 200
    assert delete_resp.json()["id"] == client_id

    get_resp = await client.get(f"/clients/{client_id}", headers=headers)
    assert get_resp.status_code == 404

    audit = await client.get("/audit-logs", headers=headers)
    assert audit.status_code == 200
    actions = [e["action"] for e in audit.json()["items"]]
    entity_ids = [e["entity_id"] for e in audit.json()["items"]]
    assert "client.deleted" in actions
    assert client_id in entity_ids


@pytest.mark.asyncio
async def test_delete_client_with_matter_still_archives(client: AsyncClient):
    token, client_id, _matter_id = await setup(client)
    headers = {"Authorization": f"Bearer {token}"}

    delete_resp = await client.delete(f"/clients/{client_id}", headers=headers)
    assert delete_resp.status_code == 200
    assert delete_resp.json()["is_active"] is False

    # Still fetchable (archived, not gone) — GET doesn't filter by is_active.
    get_resp = await client.get(f"/clients/{client_id}", headers=headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["is_active"] is False


@pytest.mark.asyncio
async def test_audit_logs_endpoint_admin_gated(client: AsyncClient):
    reg = await client.post("/auth/register", json=REGISTER)
    token = reg.json()["tokens"]["access_token"]
    admin_headers = {"Authorization": f"Bearer {token}"}

    me = await client.get("/auth/me", headers=admin_headers)
    user_id = me.json()["id"]
    org = await client.get("/auth/organisation", headers=admin_headers)
    org_id = org.json()["id"]

    member_token = create_access_token(subject=user_id, org_id=org_id, role="member")
    member_headers = {"Authorization": f"Bearer {member_token}"}

    resp = await client.get("/audit-logs", headers=member_headers)
    assert resp.status_code == 403

    admin_resp = await client.get("/audit-logs", headers=admin_headers)
    assert admin_resp.status_code == 200
