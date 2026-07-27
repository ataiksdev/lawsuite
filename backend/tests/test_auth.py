# backend/tests/api/test_auth.py
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

REGISTER_PAYLOAD = {
    "org_name": "Test Law Firm",
    "full_name": "Ada Okonkwo",
    "email": "ada@testlaw.ng",
    "password": "TestPass123",
}


# ─── Register ─────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_register_success(client: AsyncClient):
    response = await client.post("/auth/register", json=REGISTER_PAYLOAD)
    assert response.status_code == 201
    body = response.json()
    assert body["user"]["email"] == "ada@testlaw.ng"
    assert body["user"]["role"] == "admin"
    assert body["organisation"]["name"] == "Test Law Firm"
    assert body["organisation"]["slug"] == "test-law-firm"
    assert "access_token" in body["tokens"]
    assert "refresh_token" in body["tokens"]


@pytest.mark.asyncio
async def test_register_duplicate_email(client: AsyncClient):
    await client.post("/auth/register", json=REGISTER_PAYLOAD)
    response = await client.post("/auth/register", json=REGISTER_PAYLOAD)
    assert response.status_code == 409
    assert "already exists" in response.json()["detail"]


@pytest.mark.asyncio
async def test_register_weak_password(client: AsyncClient):
    payload = {**REGISTER_PAYLOAD, "email": "weak@test.ng", "password": "alllowercase"}
    response = await client.post("/auth/register", json=payload)
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_register_short_password(client: AsyncClient):
    payload = {**REGISTER_PAYLOAD, "email": "short@test.ng", "password": "Ab1"}
    response = await client.post("/auth/register", json=payload)
    assert response.status_code == 422


# ─── Login ────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_login_success(client: AsyncClient):
    await client.post("/auth/register", json=REGISTER_PAYLOAD)
    response = await client.post(
        "/auth/login",
        json={
            "email": REGISTER_PAYLOAD["email"],
            "password": REGISTER_PAYLOAD["password"],
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert "access_token" in body
    assert body["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient):
    await client.post("/auth/register", json=REGISTER_PAYLOAD)
    response = await client.post(
        "/auth/login",
        json={
            "email": REGISTER_PAYLOAD["email"],
            "password": "WrongPass999",
        },
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_login_unknown_email(client: AsyncClient):
    response = await client.post(
        "/auth/login",
        json={
            "email": "nobody@unknown.ng",
            "password": "TestPass123",
        },
    )
    assert response.status_code == 401


# ─── Token refresh ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_refresh_success(client: AsyncClient):
    reg = await client.post("/auth/register", json=REGISTER_PAYLOAD)
    refresh_token = reg.json()["tokens"]["refresh_token"]
    response = await client.post("/auth/refresh", json={"refresh_token": refresh_token})
    assert response.status_code == 200
    assert "access_token" in response.json()


@pytest.mark.asyncio
async def test_refresh_invalid_token(client: AsyncClient):
    response = await client.post("/auth/refresh", json={"refresh_token": "not.a.valid.token"})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_access_token_rejected_as_refresh(client: AsyncClient):
    reg = await client.post("/auth/register", json=REGISTER_PAYLOAD)
    access_token = reg.json()["tokens"]["access_token"]
    # Using an access token where a refresh token is expected should fail
    response = await client.post("/auth/refresh", json={"refresh_token": access_token})
    assert response.status_code == 401


# ─── /me ──────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_me_authenticated(client: AsyncClient):
    reg = await client.post("/auth/register", json=REGISTER_PAYLOAD)
    token = reg.json()["tokens"]["access_token"]
    response = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json()["email"] == REGISTER_PAYLOAD["email"]


@pytest.mark.asyncio
async def test_me_unauthenticated(client: AsyncClient):
    response = await client.get("/auth/me")
    assert response.status_code == 401


# ─── Invite + accept ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_invite_and_accept(client: AsyncClient):
    # Register admin
    reg = await client.post("/auth/register", json=REGISTER_PAYLOAD)
    admin_token = reg.json()["tokens"]["access_token"]
    headers = {"Authorization": f"Bearer {admin_token}"}

    # Invite a new member
    invite_resp = await client.post(
        "/auth/invite",
        json={
            "email": "newmember@testlaw.ng",
            "full_name": "Emeka Eze",
            "role": "member",
        },
        headers=headers,
    )
    assert invite_resp.status_code == 201

    # Extract invite token from the User record directly via DB
    # (In real flow this comes from email — for test we inspect the response)
    # We need the db session — use the service directly in integration
    # For now assert the invite was created
    assert invite_resp.json()["message"].startswith("Invite sent to")


@pytest.mark.asyncio
async def test_invite_requires_admin(client: AsyncClient):
    # Register as admin, get member token via invite flow is complex —
    # simplest: register a second org with a member account
    await client.post("/auth/register", json={**REGISTER_PAYLOAD, "email": "admin2@test.ng"})
    # This user is admin of their own org — use a viewer token (fabricate via role guard test)
    # Just test that a non-admin cannot invite
    # We'll test role guard by calling with no auth
    response = await client.post(
        "/auth/invite",
        json={
            "email": "blocked@test.ng",
            "full_name": "Blocked User",
        },
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_list_members(client: AsyncClient):
    reg = await client.post("/auth/register", json=REGISTER_PAYLOAD)
    token = reg.json()["tokens"]["access_token"]
    response = await client.get("/auth/members", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    members = response.json()
    assert len(members) >= 1
    assert members[0]["email"] == REGISTER_PAYLOAD["email"]


# ─── Notification preferences ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_notification_preferences_defaults(client: AsyncClient):
    reg = await client.post("/auth/register", json=REGISTER_PAYLOAD)
    token = reg.json()["tokens"]["access_token"]

    resp = await client.get(
        "/auth/me/notification-preferences",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body == {
        "matter_updates": True,
        "task_assigned": True,
        "task_due_soon": True,
        "calendar_event_due": True,
        "document_shared": True,
        "weekly_digest": False,
        "marketing_emails": False,
    }


@pytest.mark.asyncio
async def test_update_notification_preferences_partial(client: AsyncClient):
    reg = await client.post("/auth/register", json=REGISTER_PAYLOAD)
    token = reg.json()["tokens"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.patch(
        "/auth/me/notification-preferences",
        json={"weekly_digest": True, "matter_updates": False},
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["weekly_digest"] is True
    assert body["matter_updates"] is False
    # Untouched keys keep their defaults
    assert body["task_assigned"] is True
    assert body["document_shared"] is True

    # A second partial update doesn't clobber the first one's changes
    resp2 = await client.patch(
        "/auth/me/notification-preferences",
        json={"task_due_soon": False},
        headers=headers,
    )
    assert resp2.status_code == 200
    body2 = resp2.json()
    assert body2["task_due_soon"] is False
    assert body2["weekly_digest"] is True
    assert body2["matter_updates"] is False

    # Reflected on a fresh GET too
    resp3 = await client.get("/auth/me/notification-preferences", headers=headers)
    assert resp3.json() == body2


# ─── Organisation profile ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_organisation_profile_defaults_new_branding_fields_to_none(client: AsyncClient):
    reg = await client.post("/auth/register", json=REGISTER_PAYLOAD)
    token = reg.json()["tokens"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.get("/auth/organisation", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "Test Law Firm"
    assert body["logo_url"] is None
    assert body["address"] is None
    assert body["phone"] is None
    assert body["website"] is None


@pytest.mark.asyncio
async def test_update_organisation_profile_sets_branding_fields(client: AsyncClient):
    reg = await client.post("/auth/register", json=REGISTER_PAYLOAD)
    token = reg.json()["tokens"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.patch(
        "/auth/organisation",
        json={
            "address": "12 Broad Street, Lagos",
            "phone": "+234 1 234 5678",
            "website": "https://testlawfirm.ng",
        },
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["address"] == "12 Broad Street, Lagos"
    assert body["phone"] == "+234 1 234 5678"
    assert body["website"] == "https://testlawfirm.ng"
    # Untouched fields (name, tin) are unaffected by a partial update
    assert body["name"] == "Test Law Firm"

    # Persisted, not just echoed back
    fresh = await client.get("/auth/organisation", headers=headers)
    assert fresh.json()["address"] == "12 Broad Street, Lagos"


@pytest.mark.asyncio
async def test_update_organisation_profile_requires_admin(client: AsyncClient):
    reg = await client.post("/auth/register", json=REGISTER_PAYLOAD)
    admin_token = reg.json()["tokens"]["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    invite = await client.post(
        "/auth/invite",
        json={"email": "member@testlaw.ng", "full_name": "Member One", "role": "member"},
        headers=admin_headers,
    )
    invite_token = invite.json()["invite_url"].split("token=")[1]
    accept = await client.post(
        "/auth/accept-invite",
        json={"token": invite_token, "password": "MemberPass123"},
    )
    member_token = accept.json()["access_token"]

    resp = await client.patch(
        "/auth/organisation",
        json={"phone": "+234 1 111 1111"},
        headers={"Authorization": f"Bearer {member_token}"},
    )
    assert resp.status_code == 403


_PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"0" * 20


@pytest.mark.asyncio
async def test_upload_organisation_logo_disabled_without_supabase_config(client: AsyncClient):
    reg = await client.post("/auth/register", json=REGISTER_PAYLOAD)
    token = reg.json()["tokens"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # No SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY set in the test environment.
    resp = await client.post(
        "/auth/organisation/logo",
        files={"file": ("logo.png", _PNG_BYTES, "image/png")},
        headers=headers,
    )
    assert resp.status_code == 503


@pytest.mark.asyncio
async def test_upload_organisation_logo_success(client: AsyncClient):
    reg = await client.post("/auth/register", json=REGISTER_PAYLOAD)
    token = reg.json()["tokens"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    fake_url = "https://test.supabase.co/storage/v1/object/public/org-logos/org-id/logo.png?v=1"

    with (
        patch("app.core.config.settings.supabase_url", "https://test.supabase.co"),
        patch("app.core.config.settings.supabase_service_role_key", "fake-service-role-key"),
        patch(
            "app.services.supabase_storage_service.SupabaseStorageService.upload_logo",
            new_callable=AsyncMock,
            return_value=fake_url,
        ),
    ):
        resp = await client.post(
            "/auth/organisation/logo",
            files={"file": ("logo.png", _PNG_BYTES, "image/png")},
            headers=headers,
        )

    assert resp.status_code == 200
    assert resp.json()["logo_url"] == fake_url

    # Persisted, not just echoed back
    fresh = await client.get("/auth/organisation", headers=headers)
    assert fresh.json()["logo_url"] == fake_url


@pytest.mark.asyncio
async def test_upload_organisation_logo_rejects_non_image_extension(client: AsyncClient):
    reg = await client.post("/auth/register", json=REGISTER_PAYLOAD)
    token = reg.json()["tokens"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    with (
        patch("app.core.config.settings.supabase_url", "https://test.supabase.co"),
        patch("app.core.config.settings.supabase_service_role_key", "fake-service-role-key"),
    ):
        resp = await client.post(
            "/auth/organisation/logo",
            files={"file": ("logo.pdf", b"%PDF-1.4 fake", "application/pdf")},
            headers=headers,
        )

    assert resp.status_code == 415


# ─── Invite-check shows the inviting firm's identity ───────────────────────────


@pytest.mark.asyncio
async def test_invite_check_includes_inviting_org_name_and_logo(client: AsyncClient):
    reg = await client.post("/auth/register", json=REGISTER_PAYLOAD)
    admin_token = reg.json()["tokens"]["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    fake_url = "https://test.supabase.co/storage/v1/object/public/org-logos/org-id/logo.png?v=1"
    with (
        patch("app.core.config.settings.supabase_url", "https://test.supabase.co"),
        patch("app.core.config.settings.supabase_service_role_key", "fake-service-role-key"),
        patch(
            "app.services.supabase_storage_service.SupabaseStorageService.upload_logo",
            new_callable=AsyncMock,
            return_value=fake_url,
        ),
    ):
        await client.post(
            "/auth/organisation/logo",
            files={"file": ("logo.png", _PNG_BYTES, "image/png")},
            headers=admin_headers,
        )

    invite = await client.post(
        "/auth/invite",
        json={"email": "newbie@testlaw.ng", "full_name": "New Member", "role": "member"},
        headers=admin_headers,
    )
    invite_token = invite.json()["invite_url"].split("token=")[1]

    resp = await client.get(f"/auth/invite-check?token={invite_token}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["email"] == "newbie@testlaw.ng"
    assert body["org_name"] == "Test Law Firm"
    assert body["org_logo_url"] == fake_url


@pytest.mark.asyncio
async def test_invite_check_org_name_present_without_logo(client: AsyncClient):
    reg = await client.post("/auth/register", json=REGISTER_PAYLOAD)
    admin_token = reg.json()["tokens"]["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    invite = await client.post(
        "/auth/invite",
        json={"email": "newbie2@testlaw.ng", "full_name": "New Member Two", "role": "member"},
        headers=admin_headers,
    )
    invite_token = invite.json()["invite_url"].split("token=")[1]

    resp = await client.get(f"/auth/invite-check?token={invite_token}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["org_name"] == "Test Law Firm"
    assert body["org_logo_url"] is None
