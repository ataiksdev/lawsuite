# backend/tests/api/test_gmail.py
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient

REGISTER = {
    "org_name": "Gmail Test Firm",
    "full_name": "Yemi Okafor",
    "email": "yemi@gmailtest.ng",
    "password": "TestPass123",
}


async def setup(client: AsyncClient) -> tuple[str, str]:
    """Register, create client + matter. Return (token, matter_id)."""
    reg = await client.post("/auth/register", json=REGISTER)
    token = reg.json()["tokens"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    cl = await client.post("/clients/", json={"name": "Gmail Client"}, headers=headers)
    m = await client.post(
        "/matters/",
        json={
            "title": "Gmail Matter",
            "matter_type": "advisory",
            "client_id": cl.json()["id"],
        },
        headers=headers,
    )
    return token, m.json()["id"]


def mock_google_creds():
    """Patch GoogleCreds dependency with a fake credentials object."""
    from app.core.deps import get_google_credentials
    from app.main import app

    fake_creds = MagicMock()
    app.dependency_overrides[get_google_credentials] = lambda: fake_creds
    return fake_creds


# ─── Link thread ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_link_email_thread(client: AsyncClient):
    token, matter_id = await setup(client)
    headers = {"Authorization": f"Bearer {token}"}

    mock_google_creds()

    with patch(
        "app.services.gmail_service.GmailService.get_thread",
        new_callable=AsyncMock,
    ) as mock_thread:
        mock_thread.return_value = {
            "thread_id": "abc123",
            "subject": "Re: Engagement Letter — Acme Industries",
            "snippet": "Please find the signed letter attached...",
            "message_count": 3,
            "sender": "client@acme.ng",
            "date": "Mon, 15 Jun 2025 09:00:00 +0100",
        }

        resp = await client.post(
            f"/matters/{matter_id}/emails",
            json={"gmail_thread_id": "abc123"},
            headers=headers,
        )

    assert resp.status_code == 201
    body = resp.json()
    assert body["gmail_thread_id"] == "abc123"
    assert body["subject"] == "Re: Engagement Letter — Acme Industries"
    assert body["snippet"] is not None


@pytest.mark.asyncio
async def test_link_duplicate_thread_rejected(client: AsyncClient):
    token, matter_id = await setup(client)
    headers = {"Authorization": f"Bearer {token}"}
    mock_google_creds()

    with patch(
        "app.services.gmail_service.GmailService.get_thread",
        new_callable=AsyncMock,
        return_value={
            "thread_id": "dup123",
            "subject": "Dupe",
            "snippet": "x",
            "message_count": 1,
            "sender": None,
            "date": None,
        },
    ):
        await client.post(
            f"/matters/{matter_id}/emails",
            json={"gmail_thread_id": "dup123"},
            headers=headers,
        )
        resp = await client.post(
            f"/matters/{matter_id}/emails",
            json={"gmail_thread_id": "dup123"},
            headers=headers,
        )

    assert resp.status_code == 409


# ─── List threads ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_linked_emails(client: AsyncClient):
    token, matter_id = await setup(client)
    headers = {"Authorization": f"Bearer {token}"}
    mock_google_creds()

    with patch(
        "app.services.gmail_service.GmailService.get_thread",
        new_callable=AsyncMock,
        return_value={
            "thread_id": "t1",
            "subject": "Thread 1",
            "snippet": "s",
            "message_count": 1,
            "sender": None,
            "date": None,
        },
    ):
        await client.post(
            f"/matters/{matter_id}/emails",
            json={"gmail_thread_id": "t1"},
            headers=headers,
        )

    resp = await client.get(f"/matters/{matter_id}/emails", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 1
    assert resp.json()[0]["gmail_thread_id"] == "t1"


# ─── Unlink thread ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_unlink_email_thread(client: AsyncClient):
    token, matter_id = await setup(client)
    headers = {"Authorization": f"Bearer {token}"}
    mock_google_creds()

    with patch(
        "app.services.gmail_service.GmailService.get_thread",
        new_callable=AsyncMock,
        return_value={
            "thread_id": "t2",
            "subject": "Thread 2",
            "snippet": "s",
            "message_count": 1,
            "sender": None,
            "date": None,
        },
    ):
        link = await client.post(
            f"/matters/{matter_id}/emails",
            json={"gmail_thread_id": "t2"},
            headers=headers,
        )

    email_id = link.json()["id"]

    resp = await client.delete(
        f"/matters/{matter_id}/emails/{email_id}",
        headers=headers,
    )
    assert resp.status_code == 204

    list_resp = await client.get(f"/matters/{matter_id}/emails", headers=headers)
    assert len(list_resp.json()) == 0


# ─── Link logs activity ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_link_email_logs_activity(client: AsyncClient):
    token, matter_id = await setup(client)
    headers = {"Authorization": f"Bearer {token}"}
    mock_google_creds()

    with patch(
        "app.services.gmail_service.GmailService.get_thread",
        new_callable=AsyncMock,
        return_value={
            "thread_id": "act1",
            "subject": "Activity test",
            "snippet": "",
            "message_count": 1,
            "sender": None,
            "date": None,
        },
    ):
        await client.post(
            f"/matters/{matter_id}/emails",
            json={"gmail_thread_id": "act1"},
            headers=headers,
        )

    activity = await client.get(f"/matters/{matter_id}/activity", headers=headers)
    event_types = [e["event_type"] for e in activity.json()["items"]]
    assert "email_linked" in event_types
