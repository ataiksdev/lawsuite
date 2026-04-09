# backend/tests/api/test_documents.py

import pytest
from httpx import AsyncClient

REGISTER = {
    "org_name": "Document Test Firm",
    "full_name": "Tolu Okonkwo",
    "email": "tolu@doctest.ng",
    "password": "TestPass123",
}

LINK_PAYLOAD = {
    "name": "Engagement Letter",
    "drive_file_id": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74",
    "drive_url": "https://docs.google.com/document/d/1BxiMVs0XRA5/edit",
    "doc_type": "engagement_letter",
    "label": "unsigned draft",
}


async def setup(client: AsyncClient) -> tuple[str, str]:
    """Register, create client + matter. Return (token, matter_id)."""
    reg = await client.post("/auth/register", json=REGISTER)
    token = reg.json()["tokens"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    cl = await client.post("/clients/", json={"name": "Doc Client"}, headers=headers)
    m = await client.post(
        "/matters/",
        json={
            "title": "Document Matter",
            "matter_type": "drafting",
            "client_id": cl.json()["id"],
        },
        headers=headers,
    )
    return token, m.json()["id"]


# ─── Link document ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_link_document(client: AsyncClient):
    token, matter_id = await setup(client)
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post(f"/matters/{matter_id}/documents", json=LINK_PAYLOAD, headers=headers)
    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "Engagement Letter"
    assert body["doc_type"] == "engagement_letter"
    assert body["status"] == "draft"
    assert body["current_version"] == 1
    assert len(body["versions"]) == 1
    assert body["versions"][0]["label"] == "unsigned draft"


@pytest.mark.asyncio
async def test_list_documents(client: AsyncClient):
    token, matter_id = await setup(client)
    headers = {"Authorization": f"Bearer {token}"}

    await client.post(f"/matters/{matter_id}/documents", json=LINK_PAYLOAD, headers=headers)
    await client.post(
        f"/matters/{matter_id}/documents",
        json={
            **LINK_PAYLOAD,
            "name": "NDA",
            "drive_file_id": "another-id",
        },
        headers=headers,
    )

    resp = await client.get(f"/matters/{matter_id}/documents", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 2


# ─── Add version ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_add_version(client: AsyncClient):
    token, matter_id = await setup(client)
    headers = {"Authorization": f"Bearer {token}"}

    doc = await client.post(f"/matters/{matter_id}/documents", json=LINK_PAYLOAD, headers=headers)
    doc_id = doc.json()["id"]

    resp = await client.post(
        f"/matters/{matter_id}/documents/{doc_id}/versions",
        json={
            "drive_file_id": "signed-file-id-999",
            "drive_url": "https://docs.google.com/document/d/signed/edit",
            "label": "signed copy",
            "notes": "Client signed on 15 June 2025",
        },
        headers=headers,
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["current_version"] == 2
    assert body["drive_file_id"] == "signed-file-id-999"
    # Auto-status upgrade when label contains 'sign'
    assert body["status"] == "signed"
    assert len(body["versions"]) == 2


@pytest.mark.asyncio
async def test_version_history_newest_first(client: AsyncClient):
    token, matter_id = await setup(client)
    headers = {"Authorization": f"Bearer {token}"}

    doc = await client.post(f"/matters/{matter_id}/documents", json=LINK_PAYLOAD, headers=headers)
    doc_id = doc.json()["id"]

    await client.post(
        f"/matters/{matter_id}/documents/{doc_id}/versions",
        json={
            "drive_file_id": "v2-file",
            "drive_url": "https://docs.google.com/v2",
            "label": "revised draft",
        },
        headers=headers,
    )

    resp = await client.get(f"/matters/{matter_id}/documents/{doc_id}/versions", headers=headers)
    assert resp.status_code == 200
    versions = resp.json()
    assert len(versions) == 2
    # Newest first
    assert versions[0]["version_number"] == 2
    assert versions[1]["version_number"] == 1


# ─── Status update ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_update_document_status(client: AsyncClient):
    token, matter_id = await setup(client)
    headers = {"Authorization": f"Bearer {token}"}

    doc = await client.post(f"/matters/{matter_id}/documents", json=LINK_PAYLOAD, headers=headers)
    doc_id = doc.json()["id"]

    resp = await client.patch(
        f"/matters/{matter_id}/documents/{doc_id}/status",
        json={"status": "pending_signature"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "pending_signature"


# ─── Soft delete ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_delete_document(client: AsyncClient):
    token, matter_id = await setup(client)
    headers = {"Authorization": f"Bearer {token}"}

    doc = await client.post(f"/matters/{matter_id}/documents", json=LINK_PAYLOAD, headers=headers)
    doc_id = doc.json()["id"]

    resp = await client.delete(f"/matters/{matter_id}/documents/{doc_id}", headers=headers)
    assert resp.status_code == 204

    list_resp = await client.get(f"/matters/{matter_id}/documents", headers=headers)
    assert len(list_resp.json()) == 0


# ─── Activity log entries ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_document_link_logs_activity(client: AsyncClient):
    token, matter_id = await setup(client)
    headers = {"Authorization": f"Bearer {token}"}

    await client.post(f"/matters/{matter_id}/documents", json=LINK_PAYLOAD, headers=headers)

    activity = await client.get(f"/matters/{matter_id}/activity", headers=headers)
    event_types = [e["event_type"] for e in activity.json()["items"]]
    assert "document_added" in event_types


@pytest.mark.asyncio
async def test_document_version_logs_activity(client: AsyncClient):
    token, matter_id = await setup(client)
    headers = {"Authorization": f"Bearer {token}"}

    doc = await client.post(f"/matters/{matter_id}/documents", json=LINK_PAYLOAD, headers=headers)
    doc_id = doc.json()["id"]

    await client.post(
        f"/matters/{matter_id}/documents/{doc_id}/versions",
        json={
            "drive_file_id": "v2",
            "drive_url": "https://docs.google.com/v2",
            "label": "signed copy",
        },
        headers=headers,
    )

    activity = await client.get(f"/matters/{matter_id}/activity", headers=headers)
    event_types = [e["event_type"] for e in activity.json()["items"]]
    assert "document_version_added" in event_types


# ─── Document isolation ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_document_isolation(client: AsyncClient):
    token_a, matter_id = await setup(client)
    doc = await client.post(
        f"/matters/{matter_id}/documents", json=LINK_PAYLOAD, headers={"Authorization": f"Bearer {token_a}"}
    )
    doc_id = doc.json()["id"]

    reg_b = await client.post("/auth/register", json={**REGISTER, "email": "orgb@doctest.ng", "org_name": "Org B Docs"})
    token_b = reg_b.json()["tokens"]["access_token"]
    cl_b = await client.post("/clients/", json={"name": "B Client"}, headers={"Authorization": f"Bearer {token_b}"})
    m_b = await client.post(
        "/matters/",
        json={
            "title": "B Matter",
            "matter_type": "advisory",
            "client_id": cl_b.json()["id"],
        },
        headers={"Authorization": f"Bearer {token_b}"},
    )

    # Org B tries to access Org A's document — should 404
    resp = await client.get(
        f"/matters/{m_b.json()['id']}/documents/{doc_id}/versions", headers={"Authorization": f"Bearer {token_b}"}
    )
    assert resp.status_code == 404
