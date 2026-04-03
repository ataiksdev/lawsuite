# backend/tests/api/test_clients.py
import pytest
from httpx import AsyncClient

REGISTER = {
    "org_name": "Client Test Firm",
    "full_name": "Ngozi Adeyemi",
    "email": "ngozi@clienttest.ng",
    "password": "TestPass123",
}

CLIENT_PAYLOAD = {
    "name": "Acme Industries",
    "email": "legal@acme.ng",
    "phone": "+234 801 000 0001",
}


async def get_token(client: AsyncClient) -> str:
    reg = await client.post("/auth/register", json=REGISTER)
    return reg.json()["tokens"]["access_token"]


@pytest.mark.asyncio
async def test_create_client(client: AsyncClient):
    token = await get_token(client)
    resp = await client.post(
        "/clients/", json=CLIENT_PAYLOAD,
        headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "Acme Industries"
    assert body["email"] == "legal@acme.ng"
    assert body["is_active"] is True


@pytest.mark.asyncio
async def test_list_clients(client: AsyncClient):
    token = await get_token(client)
    headers = {"Authorization": f"Bearer {token}"}
    await client.post("/clients/", json=CLIENT_PAYLOAD, headers=headers)
    await client.post("/clients/", json={**CLIENT_PAYLOAD, "name": "Beta Corp"}, headers=headers)

    resp = await client.get("/clients/", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 2
    assert len(body["items"]) == 2


@pytest.mark.asyncio
async def test_list_clients_search(client: AsyncClient):
    token = await get_token(client)
    headers = {"Authorization": f"Bearer {token}"}
    await client.post("/clients/", json=CLIENT_PAYLOAD, headers=headers)
    await client.post("/clients/", json={**CLIENT_PAYLOAD, "name": "Beta Corp"}, headers=headers)

    resp = await client.get("/clients/?search=beta", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["total"] == 1
    assert resp.json()["items"][0]["name"] == "Beta Corp"


@pytest.mark.asyncio
async def test_get_client(client: AsyncClient):
    token = await get_token(client)
    headers = {"Authorization": f"Bearer {token}"}
    created = await client.post("/clients/", json=CLIENT_PAYLOAD, headers=headers)
    client_id = created.json()["id"]

    resp = await client.get(f"/clients/{client_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == client_id


@pytest.mark.asyncio
async def test_update_client(client: AsyncClient):
    token = await get_token(client)
    headers = {"Authorization": f"Bearer {token}"}
    created = await client.post("/clients/", json=CLIENT_PAYLOAD, headers=headers)
    client_id = created.json()["id"]

    resp = await client.patch(
        f"/clients/{client_id}",
        json={"phone": "+234 802 999 8888"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["phone"] == "+234 802 999 8888"
    assert resp.json()["name"] == "Acme Industries"


@pytest.mark.asyncio
async def test_archive_client(client: AsyncClient):
    token = await get_token(client)
    headers = {"Authorization": f"Bearer {token}"}
    created = await client.post("/clients/", json=CLIENT_PAYLOAD, headers=headers)
    client_id = created.json()["id"]

    resp = await client.delete(f"/clients/{client_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["is_active"] is False

    # Should not appear in default listing
    list_resp = await client.get("/clients/", headers=headers)
    assert list_resp.json()["total"] == 0

    # Should appear with include_inactive=true
    list_resp = await client.get("/clients/?include_inactive=true", headers=headers)
    assert list_resp.json()["total"] == 1


@pytest.mark.asyncio
async def test_client_not_found(client: AsyncClient):
    token = await get_token(client)
    headers = {"Authorization": f"Bearer {token}"}
    import uuid
    resp = await client.get(f"/clients/{uuid.uuid4()}", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_client_isolation(client: AsyncClient):
    """Client from org A must not be visible to org B."""
    token_a = await get_token(client)
    created = await client.post(
        "/clients/", json=CLIENT_PAYLOAD,
        headers={"Authorization": f"Bearer {token_a}"}
    )
    client_id = created.json()["id"]

    reg_b = await client.post("/auth/register", json={
        **REGISTER, "email": "orgb@test.ng", "org_name": "Org B"
    })
    token_b = reg_b.json()["tokens"]["access_token"]

    resp = await client.get(f"/clients/{client_id}", headers={"Authorization": f"Bearer {token_b}"})
    assert resp.status_code == 404
