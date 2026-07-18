# backend/tests/api/test_scheduled_email_tasks.py
"""
Tests for the Celery-beat-scheduled email tasks in app/workers/tasks.py.

These call the private async helper directly (e.g. _send_task_due_soon_emails)
rather than the @celery_app.task-decorated wrapper — no broker/worker needed,
matching how renew_expiring_webhook_channels already separates its thin task
wrapper from testable async logic. worker_session is patched to yield the
test's own db_session instead of opening a fresh AsyncSessionLocal.
"""
from contextlib import asynccontextmanager
from datetime import date, timedelta
from unittest.mock import patch

import pytest
from httpx import AsyncClient

REGISTER = {
    "org_name": "Reminder Test Firm",
    "full_name": "Bola Adeyemi",
    "email": "bola@remindertest.ng",
    "password": "TestPass123",
}


def _worker_session_patch(db_session):
    @asynccontextmanager
    async def _fake_worker_session():
        yield db_session

    # worker_session is imported locally inside _send_task_due_soon_emails
    # (from app.core.database import worker_session), so the name is looked
    # up from its actual source module at call time, not app.workers.tasks.
    return patch("app.core.database.worker_session", _fake_worker_session)


async def _setup_task_assigned_to_admin(client: AsyncClient, due_date: date) -> str:
    """Register, create a client + matter + a task assigned to the admin, due on due_date."""
    reg = await client.post("/auth/register", json=REGISTER)
    token = reg.json()["tokens"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    me = await client.get("/auth/me", headers=headers)
    admin_id = me.json()["id"]

    cl = await client.post("/clients/", json={"name": "Reminder Client"}, headers=headers)
    m = await client.post(
        "/matters/",
        json={"title": "Reminder Matter", "matter_type": "compliance", "client_id": cl.json()["id"]},
        headers=headers,
    )
    matter_id = m.json()["id"]

    await client.post(
        f"/matters/{matter_id}/tasks",
        json={
            "title": "Due soon task",
            "priority": "high",
            "due_date": str(due_date),
            "assigned_to": admin_id,
        },
        headers=headers,
    )
    return token


@pytest.mark.asyncio
async def test_send_task_due_soon_emails_notifies_assignee(client: AsyncClient, db_session, mock_resend):
    from app.workers.tasks import _send_task_due_soon_emails

    await _setup_task_assigned_to_admin(client, date.today() + timedelta(days=2))
    mock_resend.reset_mock()

    with _worker_session_patch(db_session):
        await _send_task_due_soon_emails()

    assert mock_resend.called
    assert mock_resend.call_args[0][0]["to"] == [REGISTER["email"]]


@pytest.mark.asyncio
async def test_send_task_due_soon_emails_skips_tasks_outside_window(client: AsyncClient, db_session, mock_resend):
    from app.workers.tasks import _send_task_due_soon_emails

    await _setup_task_assigned_to_admin(client, date.today() + timedelta(days=10))
    mock_resend.reset_mock()

    with _worker_session_patch(db_session):
        await _send_task_due_soon_emails()

    assert not mock_resend.called


@pytest.mark.asyncio
async def test_send_task_due_soon_emails_respects_preference(client: AsyncClient, db_session, mock_resend):
    from sqlalchemy import select

    from app.models.user import User
    from app.workers.tasks import _send_task_due_soon_emails

    await _setup_task_assigned_to_admin(client, date.today() + timedelta(days=1))

    user = (await db_session.execute(select(User).where(User.email == REGISTER["email"]))).scalar_one()
    user.notification_email_preferences = {"task_due_soon": False}
    await db_session.commit()
    mock_resend.reset_mock()

    with _worker_session_patch(db_session):
        await _send_task_due_soon_emails()

    assert not mock_resend.called


async def _setup_admin_with_tasks(
    client: AsyncClient, *, overdue: bool = False, due_soon: bool = False
) -> str:
    """Register, create a client + matter, and optionally an overdue and/or due-soon task assigned to the admin."""
    reg = await client.post("/auth/register", json=REGISTER)
    token = reg.json()["tokens"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    me = await client.get("/auth/me", headers=headers)
    admin_id = me.json()["id"]

    cl = await client.post("/clients/", json={"name": "Digest Client"}, headers=headers)
    m = await client.post(
        "/matters/",
        json={"title": "Digest Matter", "matter_type": "compliance", "client_id": cl.json()["id"]},
        headers=headers,
    )
    matter_id = m.json()["id"]

    if overdue:
        await client.post(
            f"/matters/{matter_id}/tasks",
            json={
                "title": "Overdue digest task",
                "priority": "high",
                "due_date": str(date.today() - timedelta(days=2)),
                "assigned_to": admin_id,
            },
            headers=headers,
        )
    if due_soon:
        await client.post(
            f"/matters/{matter_id}/tasks",
            json={
                "title": "Due-soon digest task",
                "priority": "medium",
                "due_date": str(date.today() + timedelta(days=2)),
                "assigned_to": admin_id,
            },
            headers=headers,
        )
    return token


@pytest.mark.asyncio
async def test_send_weekly_digest_emails_notifies_user_with_open_tasks(
    client: AsyncClient, db_session, mock_resend
):
    from sqlalchemy import select

    from app.models.user import User
    from app.workers.tasks import _send_weekly_digest_emails

    await _setup_admin_with_tasks(client, overdue=True, due_soon=True)

    # Weekly digest is opt-in — enable it explicitly.
    user = (await db_session.execute(select(User).where(User.email == REGISTER["email"]))).scalar_one()
    user.notification_email_preferences = {"weekly_digest": True}
    await db_session.commit()
    mock_resend.reset_mock()

    with _worker_session_patch(db_session):
        await _send_weekly_digest_emails()

    assert mock_resend.called
    assert mock_resend.call_args[0][0]["to"] == [REGISTER["email"]]


@pytest.mark.asyncio
async def test_send_weekly_digest_emails_skips_user_with_no_open_tasks(
    client: AsyncClient, db_session, mock_resend
):
    from sqlalchemy import select

    from app.models.user import User
    from app.workers.tasks import _send_weekly_digest_emails

    await _setup_admin_with_tasks(client, overdue=False, due_soon=False)

    user = (await db_session.execute(select(User).where(User.email == REGISTER["email"]))).scalar_one()
    user.notification_email_preferences = {"weekly_digest": True}
    await db_session.commit()
    mock_resend.reset_mock()

    with _worker_session_patch(db_session):
        await _send_weekly_digest_emails()

    assert not mock_resend.called


@pytest.mark.asyncio
async def test_send_weekly_digest_emails_respects_default_opt_out(
    client: AsyncClient, db_session, mock_resend
):
    from app.workers.tasks import _send_weekly_digest_emails

    # weekly_digest defaults to False — no preference override set here.
    await _setup_admin_with_tasks(client, overdue=True, due_soon=True)
    mock_resend.reset_mock()

    with _worker_session_patch(db_session):
        await _send_weekly_digest_emails()

    assert not mock_resend.called
