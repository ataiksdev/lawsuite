# backend/tests/api/test_integrations.py
import json
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

REGISTER = {
    "org_name": "Integration Test Firm",
    "full_name": "Kemi Adewale",
    "email": "kemi@integrationtest.ng",
    "password": "TestPass123",
}


async def get_admin_token(client: AsyncClient) -> str:
    reg = await client.post("/auth/register", json=REGISTER)
    return reg.json()["tokens"]["access_token"]


# ─── GET /integrations/google/connect ─────────────────────────────────────────


@pytest.mark.asyncio
async def test_google_connect_returns_auth_url(client: AsyncClient):
    token = await get_admin_token(client)

    with patch("app.services.google_auth_service.Flow.from_client_config") as mock_flow_cls:
        mock_flow = MagicMock()
        mock_flow.authorization_url.return_value = (
            "https://accounts.google.com/o/oauth2/auth?mock=true",
            "mock-state",
        )
        mock_flow_cls.return_value = mock_flow

        resp = await client.get(
            "/integrations/google/connect",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert "authorization_url" in body
    assert "accounts.google.com" in body["authorization_url"]


@pytest.mark.asyncio
async def test_google_connect_requires_admin(client: AsyncClient):
    """Non-authenticated request must be rejected."""
    resp = await client.get("/integrations/google/connect")
    assert resp.status_code == 403


# ─── GET /integrations/google/status ──────────────────────────────────────────


@pytest.mark.asyncio
async def test_google_status_not_connected(client: AsyncClient):
    token = await get_admin_token(client)
    resp = await client.get(
        "/integrations/google/status",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["connected"] is False
    assert body["scopes"] == []
    assert body["webhook_active"] is False


@pytest.mark.asyncio
async def test_google_status_after_connect(client: AsyncClient, db_session: AsyncSession):
    """Simulate a connected org by patching token fields directly."""
    from sqlalchemy import select

    from app.core.security import encrypt
    from app.models.organisation import Organisation

    await get_admin_token(client)

    # Manually inject fake tokens into the org record
    # from app.core.database import AsyncSessionLocal
    reg_resp = await client.post(
        "/auth/register", json={**REGISTER, "email": "connected@test.ng", "org_name": "Connected Org"}
    )
    org_id = reg_resp.json()["organisation"]["id"]
    conn_token = reg_resp.json()["tokens"]["access_token"]

    # async with AsyncSessionLocal() as db:
    result = await db_session.execute(select(Organisation).where(Organisation.id == org_id))
    org = result.scalar_one()
    org.google_access_token = encrypt("fake-access-token")
    org.google_refresh_token = encrypt("fake-refresh-token")
    org.google_token_expiry = datetime.now(timezone.utc) + timedelta(hours=1)
    org.google_scopes = json.dumps(["https://www.googleapis.com/auth/drive"])
    await db_session.commit()

    resp = await client.get(
        "/integrations/google/status",
        headers={"Authorization": f"Bearer {conn_token}"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["connected"] is True
    assert len(body["scopes"]) > 0


# ─── GET /integrations/google/callback ────────────────────────────────────────


@pytest.mark.asyncio
async def test_google_callback_stores_tokens(client: AsyncClient, db_session: AsyncSession):
    from sqlalchemy import select

    from app.models.organisation import Organisation
    # from app.core.database import AsyncSessionLocal

    reg = await client.post(
        "/auth/register", json={**REGISTER, "email": "callback@test.ng", "org_name": "Callback Org"}
    )
    org_id = reg.json()["organisation"]["id"]

    mock_credentials = MagicMock()
    mock_credentials.token = "fake-access-token"
    mock_credentials.refresh_token = "fake-refresh-token"
    mock_credentials.expiry = datetime.now(timezone.utc) + timedelta(hours=1)
    mock_credentials.scopes = ["https://www.googleapis.com/auth/drive"]

    with patch("app.services.google_auth_service.Flow.from_client_config") as mock_flow_cls:
        mock_flow = MagicMock()
        mock_flow.credentials = mock_credentials
        mock_flow.fetch_token = MagicMock()
        mock_flow_cls.return_value = mock_flow

        resp = await client.get(
            "/integrations/google/callback",
            params={"code": "fake-auth-code", "state": org_id},
            follow_redirects=False,
        )

    # Should redirect to frontend
    assert resp.status_code == 307
    assert "google=connected" in resp.headers["location"]

    # Tokens should now be stored (encrypted) on the org
    # async with AsyncSessionLocal() as db:
    result = await db_session.execute(select(Organisation).where(Organisation.id == org_id))
    org = result.scalar_one()
    assert org.google_access_token is not None
    assert org.google_refresh_token is not None


# ─── DELETE /integrations/google ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_google_disconnect(client: AsyncClient, db_session: AsyncSession):
    from sqlalchemy import select

    from app.core.security import encrypt
    from app.models.organisation import Organisation
    # from app.core.database import AsyncSessionLocal

    reg = await client.post(
        "/auth/register", json={**REGISTER, "email": "disconnect@test.ng", "org_name": "Disconnect Org"}
    )
    org_id = reg.json()["organisation"]["id"]
    disc_token = reg.json()["tokens"]["access_token"]

    # Inject tokens
    # async with AsyncSessionLocal() as db:
    result = await db_session.execute(select(Organisation).where(Organisation.id == org_id))
    org = result.scalar_one()
    org.google_access_token = encrypt("fake-access-token")
    org.google_refresh_token = encrypt("fake-refresh-token")
    await db_session.commit()

    # Disconnect — mock the revoke HTTP call
    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = MagicMock(status_code=200)
        resp = await client.delete(
            "/integrations/google",
            headers={"Authorization": f"Bearer {disc_token}"},
        )

    assert resp.status_code == 200
    assert "disconnected" in resp.json()["message"]

    # Verify tokens cleared
    # async with AsyncSessionLocal() as db:
    result = await db_session.execute(select(Organisation).where(Organisation.id == org_id))
    org = result.scalar_one()
    assert org.google_access_token is None
    assert org.google_refresh_token is None


@pytest.mark.asyncio
async def test_google_disconnect_requires_admin(client: AsyncClient):
    resp = await client.delete("/integrations/google")
    assert resp.status_code == 403
