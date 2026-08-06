# backend/tests/test_sync.py
import uuid

import pytest
from httpx import AsyncClient

from app.core.security import create_access_token

REGISTER = {
    "org_name": "Sync Test Firm",
    "full_name": "Chidinma Eze",
    "email": "chidinma@synctest.ng",
    "password": "TestPass123",
}


async def _register(client: AsyncClient) -> tuple[str, str, str]:
    """Returns (admin_token, user_id, org_id)."""
    reg = await client.post("/auth/register", json=REGISTER)
    body = reg.json()
    return body["tokens"]["access_token"], body["user"]["id"], body["organisation"]["id"]


def _headers_as(user_id: str, org_id: str, role: str) -> dict:
    token = create_access_token(subject=user_id, org_id=org_id, role=role)
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_get_changes_returns_org_data(client: AsyncClient):
    token, _, _ = await _register(client)
    headers = {"Authorization": f"Bearer {token}"}
    await client.post("/clients/", json={"name": "Synced Client"}, headers=headers)

    resp = await client.get("/sync/changes", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert "server_time" in body
    names = [c["name"] for c in body["tables"]["clients"]]
    assert "Synced Client" in names


@pytest.mark.asyncio
async def test_get_changes_since_filters_out_earlier_rows(client: AsyncClient):
    token, _, _ = await _register(client)
    headers = {"Authorization": f"Bearer {token}"}
    await client.post("/clients/", json={"name": "Before Cursor"}, headers=headers)

    cursor = (await client.get("/sync/changes", headers=headers)).json()["server_time"]

    await client.post("/clients/", json={"name": "After Cursor"}, headers=headers)

    resp = await client.get("/sync/changes", params={"since": cursor}, headers=headers)
    names = [c["name"] for c in resp.json()["tables"]["clients"]]
    assert "After Cursor" in names
    assert "Before Cursor" not in names


@pytest.mark.asyncio
async def test_sensitive_fields_never_returned(client: AsyncClient):
    token, _, _ = await _register(client)
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.get("/sync/changes", headers=headers)
    tables = resp.json()["tables"]

    for org in tables["organisations"]:
        assert "google_access_token" not in org
        assert "google_refresh_token" not in org
    for user in tables["users"]:
        assert "hashed_password" not in user
        assert "mfa_secret" not in user
        assert "password_reset_token" not in user
        assert "invite_token" not in user


@pytest.mark.asyncio
async def test_apply_inserts_then_updates_same_row(client: AsyncClient):
    token, user_id, org_id = await _register(client)
    headers = {"Authorization": f"Bearer {token}"}

    new_id = str(uuid.uuid4())
    row = {
        "id": new_id,
        "organisation_id": org_id,
        "name": "Pushed Client",
        "email": None,
        "phone": None,
        "billing_address": None,
        "tin": None,
        "notes": None,
        "is_active": True,
        "idempotency_key": None,
    }
    resp = await client.post("/sync/apply", json={"tables": {"clients": [row]}}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["written"]["clients"] == 1

    get_resp = await client.get(f"/clients/{new_id}", headers=headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["name"] == "Pushed Client"

    # Re-apply with a changed name -- should update, not duplicate
    row["name"] = "Pushed Client Renamed"
    resp2 = await client.post("/sync/apply", json={"tables": {"clients": [row]}}, headers=headers)
    assert resp2.json()["written"]["clients"] == 1

    get_resp2 = await client.get(f"/clients/{new_id}", headers=headers)
    assert get_resp2.json()["name"] == "Pushed Client Renamed"

    list_resp = await client.get("/clients/", headers=headers)
    matching = [c for c in list_resp.json()["items"] if c["id"] == new_id]
    assert len(matching) == 1


@pytest.mark.asyncio
async def test_apply_accepts_timestamps_as_fetched_from_changes(client: AsyncClient):
    """
    Regression test: a row round-tripped through GET /sync/changes (which
    always includes created_at/updated_at as ISO strings, e.g.
    "2026-08-06T20:36:38.234395Z") must be acceptable as-is to POST
    /sync/apply on the other side -- that's the actual shape every real
    sync exchanges. A hand-built payload that omits the timestamp fields
    (as the insert/update test above does) never exercises this and
    previously hid a bug where asyncpg rejected the ISO string outright.
    """
    source_token, _, source_org_id = await _register(client)
    source_headers = {"Authorization": f"Bearer {source_token}"}
    await client.post("/clients/", json={"name": "Timestamped Client"}, headers=source_headers)

    changes = (await client.get("/sync/changes", headers=source_headers)).json()
    fetched_row = next(c for c in changes["tables"]["clients"] if c["name"] == "Timestamped Client")
    assert fetched_row["created_at"].endswith("Z")
    assert fetched_row["updated_at"].endswith("Z")

    dest_reg = await client.post(
        "/auth/register",
        json={
            "org_name": "Sync Test Firm 2",
            "full_name": "Amara Obi",
            "email": "amara@synctest.ng",
            "password": "TestPass123",
        },
    )
    dest_body = dest_reg.json()
    dest_headers = {"Authorization": f"Bearer {dest_body['tokens']['access_token']}"}
    dest_org_id = dest_body["organisation"]["id"]
    fetched_row["organisation_id"] = dest_org_id

    resp = await client.post("/sync/apply", json={"tables": {"clients": [fetched_row]}}, headers=dest_headers)
    assert resp.status_code == 200
    assert resp.json()["written"]["clients"] == 1

    get_resp = await client.get(f"/clients/{fetched_row['id']}", headers=dest_headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["name"] == "Timestamped Client"


@pytest.mark.asyncio
async def test_apply_ignores_row_claiming_another_org(client: AsyncClient):
    token_a, _, org_a = await _register(client)
    headers_a = {"Authorization": f"Bearer {token_a}"}

    other_org_id = str(uuid.uuid4())
    row = {
        "id": str(uuid.uuid4()),
        "organisation_id": other_org_id,  # doesn't match the caller's own org
        "name": "Should Not Land Anywhere",
        "email": None, "phone": None, "billing_address": None, "tin": None,
        "notes": None, "is_active": True, "idempotency_key": None,
    }
    resp = await client.post("/sync/apply", json={"tables": {"clients": [row]}}, headers=headers_a)
    assert resp.status_code == 200
    assert resp.json()["written"]["clients"] == 0

    list_resp = await client.get("/clients/", headers=headers_a)
    assert all(c["name"] != "Should Not Land Anywhere" for c in list_resp.json()["items"])


@pytest.mark.asyncio
async def test_viewer_forbidden_from_sync_endpoints(client: AsyncClient):
    _, user_id, org_id = await _register(client)
    viewer_headers = _headers_as(user_id, org_id, "viewer")

    assert (await client.get("/sync/changes", headers=viewer_headers)).status_code == 403
    assert (
        await client.post("/sync/apply", json={"tables": {}}, headers=viewer_headers)
    ).status_code == 403


@pytest.mark.asyncio
async def test_member_forbidden_from_sync_endpoints(client: AsyncClient):
    _, user_id, org_id = await _register(client)
    member_headers = _headers_as(user_id, org_id, "member")

    assert (await client.get("/sync/changes", headers=member_headers)).status_code == 403
    assert (
        await client.post("/sync/apply", json={"tables": {}}, headers=member_headers)
    ).status_code == 403


@pytest.mark.asyncio
async def test_invoice_line_item_apply_recomputes_totals(client: AsyncClient):
    token, _, org_id = await _register(client)
    headers = {"Authorization": f"Bearer {token}"}

    cl = await client.post("/clients/", json={"name": "Invoice Client"}, headers=headers)
    client_id = cl.json()["id"]

    inv = await client.post(
        "/invoices",
        json={
            "client_id": client_id,
            "vat_enabled": False,
            "wht_enabled": False,
            "line_items": [
                {"kind": "professional_fee", "description": "Initial", "unit_amount_kobo": 100_00, "quantity": 1}
            ],
        },
        headers=headers,
    )
    assert inv.status_code == 201
    invoice_id = inv.json()["id"]
    original_total = inv.json()["total_kobo"]
    line_item_id = inv.json()["line_items"][0]["id"]

    # Push an updated amount for the existing line item via sync, bypassing
    # the normal PATCH endpoint (which would recompute on its own) --
    # this is exactly the path that needs the sync-side recompute hook.
    row = {
        "id": line_item_id,
        "organisation_id": org_id,
        "invoice_id": invoice_id,
        "kind": "professional_fee",
        "description": "Initial",
        "quantity": "1",
        "unit_amount_kobo": 500_00,
        "amount_kobo": 500_00,
        "matter_id": None,
        "fee_arrangement_id": None,
        "is_vatable": True,
        "is_wht_applicable": True,
    }
    apply_resp = await client.post(
        "/sync/apply", json={"tables": {"invoice_line_items": [row]}}, headers=headers
    )
    assert apply_resp.status_code == 200

    get_resp = await client.get(f"/invoices/{invoice_id}", headers=headers)
    new_total = get_resp.json()["total_kobo"]
    assert new_total != original_total
    assert new_total == 500_00
