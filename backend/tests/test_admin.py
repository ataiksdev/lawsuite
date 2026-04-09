# backend/tests/api/test_admin.py
from unittest.mock import patch

import pytest
from httpx import AsyncClient

REGISTER = {
    "org_name": "Admin Test Firm",
    "full_name": "Sola Ade",
    "email": "sola@admintest.ng",
    "password": "TestPass123",
}


async def get_admin_token_and_org(client: AsyncClient, payload: dict = REGISTER):
    reg = await client.post("/auth/register", json=payload)
    body = reg.json()
    return body["tokens"]["access_token"], body["organisation"]["id"]


# ─── Member management ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_members(client: AsyncClient):
    token, _ = await get_admin_token_and_org(client)
    resp = await client.get("/auth/members", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    members = resp.json()
    assert len(members) == 1
    assert members[0]["email"] == REGISTER["email"]
    assert members[0]["role"] == "admin"
    assert members[0]["has_pending_invite"] is False


@pytest.mark.asyncio
async def test_invite_and_resend(client: AsyncClient):
    token, _ = await get_admin_token_and_org(client)
    headers = {"Authorization": f"Bearer {token}"}

    # Invite
    invite_resp = await client.post(
        "/auth/invite",
        json={
            "email": "newbie@admintest.ng",
            "full_name": "New Member",
            "role": "member",
        },
        headers=headers,
    )
    assert invite_resp.status_code == 201
    user_id = invite_resp.json()["user_id"]

    # Member appears in list as pending
    members = (await client.get("/auth/members", headers=headers)).json()
    pending = [m for m in members if m["email"] == "newbie@admintest.ng"]
    assert len(pending) == 1
    assert pending[0]["has_pending_invite"] is True
    assert pending[0]["is_active"] is False

    # Resend invite
    resend = await client.post(f"/auth/members/{user_id}/resend-invite", headers=headers)
    assert resend.status_code == 200
    assert "invite_url" in resend.json()


@pytest.mark.asyncio
async def test_update_member_role(client: AsyncClient):
    token, org_id = await get_admin_token_and_org(client)
    headers = {"Authorization": f"Bearer {token}"}

    # Invite someone
    inv = await client.post(
        "/auth/invite",
        json={
            "email": "roletest@admintest.ng",
            "full_name": "Role Tester",
            "role": "member",
        },
        headers=headers,
    )
    user_id = inv.json()["user_id"]

    # Promote to admin
    resp = await client.patch(
        f"/auth/members/{user_id}/role",
        json={"role": "admin"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["role"] == "admin"


@pytest.mark.asyncio
async def test_cannot_change_own_role(client: AsyncClient):
    token, org_id = await get_admin_token_and_org(client)
    headers = {"Authorization": f"Bearer {token}"}

    # Get own user_id
    me = (await client.get("/auth/me", headers=headers)).json()
    user_id = me["id"]

    resp = await client.patch(
        f"/auth/members/{user_id}/role",
        json={"role": "viewer"},
        headers=headers,
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_remove_member(client: AsyncClient):
    token, _ = await get_admin_token_and_org(client)
    headers = {"Authorization": f"Bearer {token}"}

    inv = await client.post(
        "/auth/invite",
        json={
            "email": "remove@admintest.ng",
            "full_name": "To Remove",
            "role": "viewer",
        },
        headers=headers,
    )
    user_id = inv.json()["user_id"]

    resp = await client.delete(f"/auth/members/{user_id}", headers=headers)
    assert resp.status_code == 204

    members = (await client.get("/auth/members", headers=headers)).json()
    emails = [m["email"] for m in members]
    assert "remove@admintest.ng" not in emails


@pytest.mark.asyncio
async def test_cannot_remove_self(client: AsyncClient):
    token, _ = await get_admin_token_and_org(client)
    headers = {"Authorization": f"Bearer {token}"}
    me = (await client.get("/auth/me", headers=headers)).json()

    resp = await client.delete(f"/auth/members/{me['id']}", headers=headers)
    assert resp.status_code == 400


# ─── Profile + password ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_update_own_profile(client: AsyncClient):
    token, _ = await get_admin_token_and_org(client)
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.patch("/auth/me", json={"full_name": "Sola Adeyemi Updated"}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["full_name"] == "Sola Adeyemi Updated"


@pytest.mark.asyncio
async def test_change_password(client: AsyncClient):
    token, _ = await get_admin_token_and_org(client)
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post(
        "/auth/me/change-password",
        json={
            "current_password": "TestPass123",
            "new_password": "NewPass456",
        },
        headers=headers,
    )
    assert resp.status_code == 204

    # Can login with new password
    login = await client.post("/auth/login", json={"email": REGISTER["email"], "password": "NewPass456"})
    assert login.status_code == 200


@pytest.mark.asyncio
async def test_change_password_wrong_current(client: AsyncClient):
    token, _ = await get_admin_token_and_org(client)
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post(
        "/auth/me/change-password",
        json={
            "current_password": "WrongPass999",
            "new_password": "NewPass456",
        },
        headers=headers,
    )
    assert resp.status_code == 401


# ─── Organisation management ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_organisation(client: AsyncClient):
    token, org_id = await get_admin_token_and_org(client)
    resp = await client.get("/auth/organisation", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == org_id
    assert body["name"] == REGISTER["org_name"]
    assert body["plan"] == "free"


@pytest.mark.asyncio
async def test_update_organisation_name(client: AsyncClient):
    token, _ = await get_admin_token_and_org(client)
    resp = await client.patch(
        "/auth/organisation",
        json={"name": "Renamed Law Firm"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Renamed Law Firm"


@pytest.mark.asyncio
async def test_update_organisation_requires_admin(client: AsyncClient):
    resp = await client.patch("/auth/organisation", json={"name": "x"})
    assert resp.status_code == 403


# ─── Platform admin (stats + org management) ──────────────────────────────────


@pytest.mark.asyncio
async def test_platform_admin_blocked_without_config(client: AsyncClient):
    """Without PLATFORM_ADMIN_ORG_ID set, /admin/* returns 403."""
    token, _ = await get_admin_token_and_org(client)
    with patch.object(
        __import__("app.core.config", fromlist=["settings"]).settings,
        "platform_admin_org_id",
        "",
    ):
        resp = await client.get("/admin/stats", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_platform_admin_stats(client: AsyncClient):
    """With correct PLATFORM_ADMIN_ORG_ID, /admin/stats returns metrics."""
    token, org_id = await get_admin_token_and_org(client)

    with patch.object(
        __import__("app.core.config", fromlist=["settings"]).settings,
        "platform_admin_org_id",
        org_id,
    ):
        resp = await client.get("/admin/stats", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    body = resp.json()
    assert "organisations" in body
    assert "users" in body
    assert "matters" in body
    assert body["organisations"]["total"] >= 1


@pytest.mark.asyncio
async def test_platform_admin_list_orgs(client: AsyncClient):
    token, org_id = await get_admin_token_and_org(client)

    with patch.object(
        __import__("app.core.config", fromlist=["settings"]).settings,
        "platform_admin_org_id",
        org_id,
    ):
        resp = await client.get("/admin/organisations", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] >= 1
    assert any(o["id"] == org_id for o in body["items"])


@pytest.mark.asyncio
async def test_platform_admin_plan_override(client: AsyncClient):
    token, org_id = await get_admin_token_and_org(client)

    # Register a second org to override
    reg2 = await client.post(
        "/auth/register", json={**REGISTER, "email": "target@admintest.ng", "org_name": "Target Org"}
    )
    target_org_id = reg2.json()["organisation"]["id"]

    with patch.object(
        __import__("app.core.config", fromlist=["settings"]).settings,
        "platform_admin_org_id",
        org_id,
    ):
        resp = await client.post(
            f"/admin/organisations/{target_org_id}/plan",
            json={"plan": "agency", "reason": "Complimentary access"},
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 200
    assert resp.json()["plan"] == "agency"


@pytest.mark.asyncio
async def test_platform_admin_deactivate_reactivate(client: AsyncClient):
    token, org_id = await get_admin_token_and_org(client)

    reg2 = await client.post(
        "/auth/register", json={**REGISTER, "email": "suspend@admintest.ng", "org_name": "Suspend Org"}
    )
    target_org_id = reg2.json()["organisation"]["id"]

    with patch.object(
        __import__("app.core.config", fromlist=["settings"]).settings,
        "platform_admin_org_id",
        org_id,
    ):
        headers = {"Authorization": f"Bearer {token}"}

        # Deactivate
        resp = await client.post(f"/admin/organisations/{target_org_id}/deactivate", headers=headers)
        assert resp.status_code == 200

        # Reactivate
        resp = await client.post(f"/admin/organisations/{target_org_id}/activate", headers=headers)
        assert resp.status_code == 200
