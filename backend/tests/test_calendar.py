from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient

from app.core.deps import get_google_credentials
from app.main import app as main_app

REGISTER = {
    "org_name": "Calendar Test Firm",
    "full_name": "Lara Okafor",
    "email": "lara@calendar.ng",
    "password": "TestPass123",
}


async def setup(client: AsyncClient) -> tuple[str, str]:
    reg = await client.post("/auth/register", json=REGISTER)
    token = reg.json()["tokens"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    cl = await client.post("/clients/", json={"name": "Calendar Client"}, headers=headers)
    client_id = cl.json()["id"]

    matter = await client.post(
        "/matters/",
        json={"title": "Hearing matter", "matter_type": "litigation", "client_id": client_id},
        headers=headers,
    )
    return token, matter.json()["id"]


@pytest.mark.asyncio
async def test_create_and_list_calendar_event(client: AsyncClient):
    token, matter_id = await setup(client)
    headers = {"Authorization": f"Bearer {token}"}
    starts_at = datetime.now(timezone.utc) + timedelta(days=2)

    create = await client.post(
        f"/calendar/matters/{matter_id}/events",
        json={
            "title": "Court mention",
            "event_type": "court_date",
            "starts_at": starts_at.isoformat(),
            "ends_at": (starts_at + timedelta(hours=2)).isoformat(),
        },
        headers=headers,
    )

    assert create.status_code == 201
    assert create.json()["event_type"] == "court_date"

    listed = await client.get("/calendar/events", params={"matter_id": matter_id}, headers=headers)
    assert listed.status_code == 200
    assert listed.json()["total"] == 1
    assert listed.json()["items"][0]["title"] == "Court mention"


@pytest.mark.asyncio
async def test_create_note_with_svg_and_event_link(client: AsyncClient):
    token, matter_id = await setup(client)
    headers = {"Authorization": f"Bearer {token}"}
    starts_at = datetime.now(timezone.utc) + timedelta(days=1)

    event = await client.post(
        f"/calendar/matters/{matter_id}/events",
        json={"title": "Filing deadline", "event_type": "deadline", "starts_at": starts_at.isoformat()},
        headers=headers,
    )
    event_id = event.json()["id"]

    note = await client.post(
        "/notes",
        json={
            "title": "Bench notes",
            "body": "Typed prep items",
            "svg_content": "<svg viewBox='0 0 10 10'><path d='M0 0 L10 10' /></svg>",
            "matter_id": matter_id,
            "event_id": event_id,
        },
        headers=headers,
    )

    assert note.status_code == 201
    body = note.json()
    assert body["note_type"] == "mixed"
    assert body["event_id"] == event_id


@pytest.mark.asyncio
async def test_add_task_comment_to_note_same_matter_only(client: AsyncClient):
    token, matter_id = await setup(client)
    headers = {"Authorization": f"Bearer {token}"}

    task = await client.post(
        f"/matters/{matter_id}/tasks",
        json={"title": "Prepare witness"},
        headers=headers,
    )
    task_id = task.json()["id"]
    comment = await client.post(
        f"/matters/{matter_id}/tasks/{task_id}/comments",
        json={"body": "Need to confirm exhibit bundle."},
        headers=headers,
    )
    comment_id = comment.json()["id"]

    note = await client.post(
        "/notes",
        json={"title": "Case notes", "body": "Opening note", "matter_id": matter_id},
        headers=headers,
    )
    note_id = note.json()["id"]

    attach = await client.post(
        f"/notes/{note_id}/add-comment",
        json={"note_id": note_id, "task_id": task_id, "comment_id": comment_id},
        headers=headers,
    )

    assert attach.status_code == 200
    assert "Need to confirm exhibit bundle." in attach.json()["body"]


@pytest.mark.asyncio
async def test_add_task_comment_to_note_rejects_other_matter_note(client: AsyncClient):
    token, matter_id = await setup(client)
    headers = {"Authorization": f"Bearer {token}"}

    second_client = await client.post("/clients/", json={"name": "Second Client"}, headers=headers)
    second_matter = await client.post(
        "/matters/",
        json={"title": "Separate matter", "matter_type": "advisory", "client_id": second_client.json()["id"]},
        headers=headers,
    )
    second_matter_id = second_matter.json()["id"]

    task = await client.post(f"/matters/{matter_id}/tasks", json={"title": "Draft memo"}, headers=headers)
    comment = await client.post(
        f"/matters/{matter_id}/tasks/{task.json()['id']}/comments",
        json={"body": "This should stay in the same matter."},
        headers=headers,
    )
    note = await client.post(
        "/notes",
        json={"title": "Other matter note", "body": "Separate", "matter_id": second_matter_id},
        headers=headers,
    )
    note_id = note.json()["id"]

    attach = await client.post(
        f"/notes/{note_id}/add-comment",
        json={"note_id": note_id, "task_id": task.json()["id"], "comment_id": comment.json()["id"]},
        headers=headers,
    )

    # NoteService.add_comment_to_note raises 422 for matter mismatch
    assert attach.status_code == 422


@pytest.mark.asyncio
async def test_sync_event_to_google(client: AsyncClient):
    token, matter_id = await setup(client)
    headers = {"Authorization": f"Bearer {token}"}
    starts_at = datetime.now(timezone.utc) + timedelta(days=3)

    event = await client.post(
        f"/calendar/matters/{matter_id}/events",
        json={"title": "Sync me", "event_type": "meeting", "starts_at": starts_at.isoformat()},
        headers=headers,
    )
    event_id = event.json()["id"]

    async def fake_google_credentials():
        class DummyCredentials:
            pass

        return DummyCredentials()

    main_app.dependency_overrides[get_google_credentials] = fake_google_credentials

    from unittest.mock import AsyncMock, patch

    try:
        with patch("app.services.google_calendar_service.GoogleCalendarService.push_event", new=AsyncMock()) as mock_push:
            mock_push.return_value = {"id": "google-event-1", "htmlLink": "https://calendar.google.com/event?eid=1"}
            synced = await client.post(
                f"/calendar/matters/{matter_id}/events/{event_id}/sync",
                headers=headers,
            )
    finally:
        main_app.dependency_overrides.pop(get_google_credentials, None)

    assert synced.status_code == 200
    assert synced.json()["google_event_id"] == "google-event-1"
    assert synced.json()["google_sync_status"] == "synced"
