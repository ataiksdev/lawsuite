# backend/tests/api/test_matters.py
import uuid

import pytest
from httpx import AsyncClient

REGISTER = {
    "org_name": "Matter Test Firm",
    "full_name": "Chidi Okeke",
    "email": "chidi@mattertest.ng",
    "password": "TestPass123",
}

CLIENT_PAYLOAD = {"name": "Test Client Ltd", "email": "tc@test.ng"}

MATTER_PAYLOAD = {
    "title": "Nigeria Tax Act 2025 Compliance Review",
    "matter_type": "compliance",
}


async def setup(client: AsyncClient) -> tuple[str, str]:
    """Register, create a client, return (token, client_id)."""
    reg = await client.post("/auth/register", json=REGISTER)
    token = reg.json()["tokens"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    cl = await client.post("/clients/", json=CLIENT_PAYLOAD, headers=headers)
    return token, cl.json()["id"]


async def _add_member(db_session, org_id: str, email: str) -> "uuid.UUID":
    """Directly create a second org member (bypasses the invite/accept email flow)."""
    from app.models.user import OrganisationMember, User

    user = User(email=email, full_name="Second Lawyer", is_active=True, is_verified=True)
    db_session.add(user)
    await db_session.flush()
    db_session.add(OrganisationMember(organisation_id=org_id, user_id=user.id))
    await db_session.commit()
    return user.id


@pytest.mark.asyncio
async def test_create_matter(client: AsyncClient):
    token, client_id = await setup(client)
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post(
        "/matters/",
        json={**MATTER_PAYLOAD, "client_id": client_id},
        headers=headers,
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["title"] == MATTER_PAYLOAD["title"]
    assert body["status"] == "intake"
    assert body["reference_no"].startswith("MAT-")
    assert body["client"]["name"] == "Test Client Ltd"


@pytest.mark.asyncio
async def test_reference_number_increments(client: AsyncClient):
    token, client_id = await setup(client)
    headers = {"Authorization": f"Bearer {token}"}

    r1 = await client.post("/matters/", json={**MATTER_PAYLOAD, "client_id": client_id}, headers=headers)
    r2 = await client.post(
        "/matters/", json={**MATTER_PAYLOAD, "client_id": client_id, "title": "Second Matter"}, headers=headers
    )

    ref1 = r1.json()["reference_no"]
    ref2 = r2.json()["reference_no"]
    assert ref1 != ref2
    assert ref1[-4:] == "0001"
    assert ref2[-4:] == "0002"


@pytest.mark.asyncio
async def test_list_matters(client: AsyncClient):
    token, client_id = await setup(client)
    headers = {"Authorization": f"Bearer {token}"}

    await client.post("/matters/", json={**MATTER_PAYLOAD, "client_id": client_id}, headers=headers)
    await client.post(
        "/matters/", json={**MATTER_PAYLOAD, "title": "Second Matter", "client_id": client_id}, headers=headers
    )

    resp = await client.get("/matters/", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["total"] == 2


@pytest.mark.asyncio
async def test_list_matters_filter_by_status(client: AsyncClient):
    token, client_id = await setup(client)
    headers = {"Authorization": f"Bearer {token}"}

    m = await client.post("/matters/", json={**MATTER_PAYLOAD, "client_id": client_id}, headers=headers)
    matter_id = m.json()["id"]

    # Move to open
    await client.patch(f"/matters/{matter_id}/status", json={"status": "open"}, headers=headers)

    resp = await client.get("/matters/?status=open", headers=headers)
    assert resp.json()["total"] == 1

    resp = await client.get("/matters/?status=intake", headers=headers)
    assert resp.json()["total"] == 0


@pytest.mark.asyncio
async def test_update_matter(client: AsyncClient):
    token, client_id = await setup(client)
    headers = {"Authorization": f"Bearer {token}"}

    m = await client.post("/matters/", json={**MATTER_PAYLOAD, "client_id": client_id}, headers=headers)
    matter_id = m.json()["id"]

    resp = await client.patch(
        f"/matters/{matter_id}",
        json={"title": "Updated Title"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["title"] == "Updated Title"


@pytest.mark.asyncio
async def test_valid_status_transition(client: AsyncClient):
    token, client_id = await setup(client)
    headers = {"Authorization": f"Bearer {token}"}

    m = await client.post("/matters/", json={**MATTER_PAYLOAD, "client_id": client_id}, headers=headers)
    matter_id = m.json()["id"]

    resp = await client.patch(
        f"/matters/{matter_id}/status",
        json={"status": "open", "reason": "Engagement letter signed"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "open"


@pytest.mark.asyncio
async def test_invalid_status_transition(client: AsyncClient):
    token, client_id = await setup(client)
    headers = {"Authorization": f"Bearer {token}"}

    m = await client.post("/matters/", json={**MATTER_PAYLOAD, "client_id": client_id}, headers=headers)
    matter_id = m.json()["id"]

    # intake → in_review is not allowed
    resp = await client.patch(
        f"/matters/{matter_id}/status",
        json={"status": "in_review"},
        headers=headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_activity_log_on_create(client: AsyncClient):
    token, client_id = await setup(client)
    headers = {"Authorization": f"Bearer {token}"}

    m = await client.post("/matters/", json={**MATTER_PAYLOAD, "client_id": client_id}, headers=headers)
    matter_id = m.json()["id"]

    resp = await client.get(f"/matters/{matter_id}/activity", headers=headers)
    assert resp.status_code == 200
    logs = resp.json()["items"]
    assert len(logs) >= 1
    assert logs[0]["event_type"] == "matter_created"


@pytest.mark.asyncio
async def test_activity_log_on_status_change(client: AsyncClient):
    token, client_id = await setup(client)
    headers = {"Authorization": f"Bearer {token}"}

    m = await client.post("/matters/", json={**MATTER_PAYLOAD, "client_id": client_id}, headers=headers)
    matter_id = m.json()["id"]
    await client.patch(f"/matters/{matter_id}/status", json={"status": "open"}, headers=headers)

    resp = await client.get(f"/matters/{matter_id}/activity", headers=headers)
    event_types = [e["event_type"] for e in resp.json()["items"]]
    assert "status_changed" in event_types
    assert "matter_created" in event_types


@pytest.mark.asyncio
async def test_matter_isolation(client: AsyncClient):
    """Matter from org A must not be visible to org B."""
    token_a, client_id = await setup(client)
    m = await client.post(
        "/matters/",
        json={**MATTER_PAYLOAD, "client_id": client_id},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    matter_id = m.json()["id"]

    reg_b = await client.post(
        "/auth/register", json={**REGISTER, "email": "orgb@mattertest.ng", "org_name": "Org B Matters"}
    )
    token_b = reg_b.json()["tokens"]["access_token"]

    resp = await client.get(f"/matters/{matter_id}", headers={"Authorization": f"Bearer {token_b}"})
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_requires_archived(client: AsyncClient):
    token, client_id = await setup(client)
    headers = {"Authorization": f"Bearer {token}"}

    m = await client.post("/matters/", json={**MATTER_PAYLOAD, "client_id": client_id}, headers=headers)
    matter_id = m.json()["id"]

    # Cannot delete while in intake
    resp = await client.delete(f"/matters/{matter_id}", headers=headers)
    assert resp.status_code == 422


# ─── Matter-update email notifications ─────────────────────────────────────────


@pytest.mark.asyncio
async def test_matter_assignment_sends_email_by_default(client: AsyncClient, db_session, mock_resend):
    from sqlalchemy import select

    from app.models.organisation import Organisation

    token, client_id = await setup(client)
    headers = {"Authorization": f"Bearer {token}"}
    org = (await db_session.execute(select(Organisation))).scalar_one()
    second_user_id = await _add_member(db_session, str(org.id), "second@mattertest.ng")

    resp = await client.post(
        "/matters/",
        json={**MATTER_PAYLOAD, "client_id": client_id, "assigned_to": str(second_user_id)},
        headers=headers,
    )
    assert resp.status_code == 201
    assert mock_resend.called
    assert mock_resend.call_args[0][0]["to"] == ["second@mattertest.ng"]


@pytest.mark.asyncio
async def test_matter_assignment_respects_disabled_preference(client: AsyncClient, db_session, mock_resend):
    from sqlalchemy import select

    from app.models.organisation import Organisation
    from app.models.user import User

    token, client_id = await setup(client)
    headers = {"Authorization": f"Bearer {token}"}
    org = (await db_session.execute(select(Organisation))).scalar_one()
    second_user_id = await _add_member(db_session, str(org.id), "third@mattertest.ng")

    user = (await db_session.execute(select(User).where(User.id == second_user_id))).scalar_one()
    user.notification_email_preferences = {"matter_updates": False}
    await db_session.commit()

    resp = await client.post(
        "/matters/",
        json={**MATTER_PAYLOAD, "client_id": client_id, "assigned_to": str(second_user_id)},
        headers=headers,
    )
    assert resp.status_code == 201
    assert not mock_resend.called


@pytest.mark.asyncio
async def test_matter_reassignment_via_update_notifies_new_assignee(client: AsyncClient, db_session, mock_resend):
    """
    Regression test: update_matter's reassignment check used to compare
    against matter.assigned_to *after* it had already been mutated to the
    new value in the same loop, so it always evaluated false and neither
    the in-app notification nor (now) the email ever fired. Confirm both
    actually fire on a genuine reassignment.
    """
    from sqlalchemy import select

    from app.models.organisation import Organisation

    token, client_id = await setup(client)
    headers = {"Authorization": f"Bearer {token}"}
    org = (await db_session.execute(select(Organisation))).scalar_one()
    second_user_id = await _add_member(db_session, str(org.id), "reassign@mattertest.ng")

    m = await client.post("/matters/", json={**MATTER_PAYLOAD, "client_id": client_id}, headers=headers)
    matter_id = m.json()["id"]
    mock_resend.reset_mock()

    resp = await client.patch(
        f"/matters/{matter_id}",
        json={"assigned_to": str(second_user_id)},
        headers=headers,
    )
    assert resp.status_code == 200
    assert mock_resend.called
    assert mock_resend.call_args[0][0]["to"] == ["reassign@mattertest.ng"]
