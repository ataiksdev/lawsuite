# backend/tests/api/test_tasks.py
from datetime import date, timedelta

import pytest
from httpx import AsyncClient

REGISTER = {
    "org_name": "Task Test Firm",
    "full_name": "Amaka Osei",
    "email": "amaka@tasktest.ng",
    "password": "TestPass123",
}

TASK_PAYLOAD = {
    "title": "Review contract clause 14",
    "priority": "high",
}


async def setup(client: AsyncClient) -> tuple[str, str, str]:
    """Register, create client + matter. Return (token, client_id, matter_id)."""
    reg = await client.post("/auth/register", json=REGISTER)
    token = reg.json()["tokens"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    cl = await client.post("/clients/", json={"name": "Task Client"}, headers=headers)
    client_id = cl.json()["id"]

    m = await client.post(
        "/matters/",
        json={
            "title": "Test Matter",
            "matter_type": "advisory",
            "client_id": client_id,
        },
        headers=headers,
    )
    matter_id = m.json()["id"]

    return token, client_id, matter_id


# ─── Create ───────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_task(client: AsyncClient):
    token, _, matter_id = await setup(client)
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post(f"/matters/{matter_id}/tasks", json=TASK_PAYLOAD, headers=headers)
    assert resp.status_code == 201
    body = resp.json()
    assert body["title"] == TASK_PAYLOAD["title"]
    assert body["status"] == "todo"
    assert body["priority"] == "high"
    assert body["is_deleted"] is False
    assert body["completed_at"] is None


@pytest.mark.asyncio
async def test_create_task_with_due_date(client: AsyncClient):
    token, _, matter_id = await setup(client)
    headers = {"Authorization": f"Bearer {token}"}
    due = str(date.today() + timedelta(days=7))

    resp = await client.post(
        f"/matters/{matter_id}/tasks",
        json={
            **TASK_PAYLOAD,
            "due_date": due,
        },
        headers=headers,
    )
    assert resp.status_code == 201
    assert resp.json()["due_date"] == due


# ─── List ─────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_tasks(client: AsyncClient):
    token, _, matter_id = await setup(client)
    headers = {"Authorization": f"Bearer {token}"}

    await client.post(f"/matters/{matter_id}/tasks", json=TASK_PAYLOAD, headers=headers)
    await client.post(f"/matters/{matter_id}/tasks", json={**TASK_PAYLOAD, "title": "Second task"}, headers=headers)

    resp = await client.get(f"/matters/{matter_id}/tasks", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["total"] == 2


@pytest.mark.asyncio
async def test_list_tasks_filter_by_status(client: AsyncClient):
    token, _, matter_id = await setup(client)
    headers = {"Authorization": f"Bearer {token}"}

    t = await client.post(f"/matters/{matter_id}/tasks", json=TASK_PAYLOAD, headers=headers)
    task_id = t.json()["id"]
    await client.post(f"/matters/{matter_id}/tasks", json={**TASK_PAYLOAD, "title": "Other"}, headers=headers)

    # Mark first task done
    await client.patch(f"/matters/{matter_id}/tasks/{task_id}", json={"status": "done"}, headers=headers)

    resp = await client.get(f"/matters/{matter_id}/tasks?status=done", headers=headers)
    assert resp.json()["total"] == 1

    resp = await client.get(f"/matters/{matter_id}/tasks?status=todo", headers=headers)
    assert resp.json()["total"] == 1


# ─── Update ───────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_update_task_fields(client: AsyncClient):
    token, _, matter_id = await setup(client)
    headers = {"Authorization": f"Bearer {token}"}

    t = await client.post(f"/matters/{matter_id}/tasks", json=TASK_PAYLOAD, headers=headers)
    task_id = t.json()["id"]

    resp = await client.patch(
        f"/matters/{matter_id}/tasks/{task_id}",
        json={
            "title": "Updated title",
            "priority": "low",
        },
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["title"] == "Updated title"
    assert resp.json()["priority"] == "low"


@pytest.mark.asyncio
async def test_complete_task_sets_timestamp(client: AsyncClient):
    token, _, matter_id = await setup(client)
    headers = {"Authorization": f"Bearer {token}"}

    t = await client.post(f"/matters/{matter_id}/tasks", json=TASK_PAYLOAD, headers=headers)
    task_id = t.json()["id"]

    resp = await client.patch(f"/matters/{matter_id}/tasks/{task_id}", json={"status": "done"}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "done"
    assert resp.json()["completed_at"] is not None


@pytest.mark.asyncio
async def test_complete_task_logs_activity(client: AsyncClient):
    token, _, matter_id = await setup(client)
    headers = {"Authorization": f"Bearer {token}"}

    t = await client.post(f"/matters/{matter_id}/tasks", json=TASK_PAYLOAD, headers=headers)
    task_id = t.json()["id"]

    await client.patch(f"/matters/{matter_id}/tasks/{task_id}", json={"status": "done"}, headers=headers)

    activity = await client.get(f"/matters/{matter_id}/activity", headers=headers)
    event_types = [e["event_type"] for e in activity.json()["items"]]
    assert "task_completed" in event_types


# ─── Delete (soft) ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_soft_delete_task(client: AsyncClient):
    token, _, matter_id = await setup(client)
    headers = {"Authorization": f"Bearer {token}"}

    t = await client.post(f"/matters/{matter_id}/tasks", json=TASK_PAYLOAD, headers=headers)
    task_id = t.json()["id"]

    resp = await client.delete(f"/matters/{matter_id}/tasks/{task_id}", headers=headers)
    assert resp.status_code == 204

    # Deleted task should not appear in list
    list_resp = await client.get(f"/matters/{matter_id}/tasks", headers=headers)
    assert list_resp.json()["total"] == 0


@pytest.mark.asyncio
async def test_delete_task_not_found(client: AsyncClient):
    token, _, matter_id = await setup(client)
    headers = {"Authorization": f"Bearer {token}"}
    import uuid

    resp = await client.delete(f"/matters/{matter_id}/tasks/{uuid.uuid4()}", headers=headers)
    assert resp.status_code == 404


# ─── Overdue ──────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_overdue_tasks(client: AsyncClient):
    token, _, matter_id = await setup(client)
    headers = {"Authorization": f"Bearer {token}"}

    past = str(date.today() - timedelta(days=3))
    future = str(date.today() + timedelta(days=3))

    # Create one overdue and one future task
    await client.post(
        f"/matters/{matter_id}/tasks",
        json={
            **TASK_PAYLOAD,
            "title": "Overdue task",
            "due_date": past,
        },
        headers=headers,
    )
    await client.post(
        f"/matters/{matter_id}/tasks",
        json={
            **TASK_PAYLOAD,
            "title": "Future task",
            "due_date": future,
        },
        headers=headers,
    )

    resp = await client.get("/tasks/overdue", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["items"][0]["title"] == "Overdue task"
    assert "matter_title" in body["items"][0]
    assert "matter_reference_no" in body["items"][0]


@pytest.mark.asyncio
async def test_completed_tasks_not_overdue(client: AsyncClient):
    token, _, matter_id = await setup(client)
    headers = {"Authorization": f"Bearer {token}"}

    past = str(date.today() - timedelta(days=3))
    t = await client.post(
        f"/matters/{matter_id}/tasks",
        json={
            **TASK_PAYLOAD,
            "due_date": past,
        },
        headers=headers,
    )
    task_id = t.json()["id"]

    # Mark it done
    await client.patch(f"/matters/{matter_id}/tasks/{task_id}", json={"status": "done"}, headers=headers)

    resp = await client.get("/tasks/overdue", headers=headers)
    assert resp.json()["total"] == 0


@pytest.mark.asyncio
async def test_task_isolation(client: AsyncClient):
    """Tasks from org A must not appear in org B's overdue list."""
    token_a, _, matter_id = await setup(client)
    past = str(date.today() - timedelta(days=1))
    await client.post(
        f"/matters/{matter_id}/tasks",
        json={
            **TASK_PAYLOAD,
            "due_date": past,
        },
        headers={"Authorization": f"Bearer {token_a}"},
    )

    reg_b = await client.post(
        "/auth/register",
        json={
            **REGISTER,
            "email": "orgb@tasktest.ng",
            "org_name": "Org B Tasks",
        },
    )
    token_b = reg_b.json()["tokens"]["access_token"]

    resp = await client.get("/tasks/overdue", headers={"Authorization": f"Bearer {token_b}"})
    assert resp.json()["total"] == 0
