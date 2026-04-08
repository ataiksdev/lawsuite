# backend/tests/api/test_google_signin.py
"""
Tests for Google OAuth sign-in flow.

All external HTTP calls to Google are mocked — no real OAuth needed.
Tests verify:
  - New user creates provisional token, then completes org signup
  - Existing email user gets accounts linked
  - Existing Google OAuth user is recognised and logged in
  - Conflicting Google accounts are rejected
  - Trial is started on Google OAuth signup
"""

from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

REGISTER = {
    "org_name": "Google Auth Test Firm",
    "full_name": "Chibuzor Nwosu",
    "email": "chibuzor@googletest.ng",
    "password": "TestPass123",
}

# Simulated Google userinfo payload
GOOGLE_USER = {
    "sub": "google-oauth-id-12345",
    "email": "chibuzor@googletest.ng",
    "email_verified": True,
    "name": "Chibuzor Nwosu",
    "picture": "https://lh3.googleusercontent.com/avatar",
}


def mock_google_fetch(user_info: dict = GOOGLE_USER):
    """Patch _fetch_user_info to return controlled test data."""
    return patch(
        "app.services.google_signin_service.GoogleSignInService._fetch_user_info",
        new_callable=AsyncMock,
        return_value=user_info,
    )


# ─── New user flow ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_new_google_user_gets_provisional_token(client: AsyncClient):
    """
    A brand-new Google user (no matching email) gets a provisional token
    so the frontend can show the org creation screen.
    """
    new_user = {**GOOGLE_USER, "sub": "new-google-id-111", "email": "newgoogle@test.ng"}
    with mock_google_fetch(new_user):
        resp = await client.get(
            "/auth/google/callback?code=fake_code&state=fake_state",
            follow_redirects=False,
        )

    # Should redirect to /onboarding?provisional=...
    assert resp.status_code in (302, 307)
    location = resp.headers.get("location", "")
    assert "/onboarding" in location
    assert "provisional=" in location


@pytest.mark.asyncio
async def test_new_google_user_complete_signup_creates_org_with_trial(client: AsyncClient):
    """
    After getting a provisional token, the user POSTs their org name
    and receives full tokens + org with 30-day trial.
    """
    new_user = {**GOOGLE_USER, "sub": "new-google-id-222", "email": "signup@googletest.ng"}

    with mock_google_fetch(new_user):
        redirect = await client.get(
            "/auth/google/callback?code=fake_code&state=fake_state",
            follow_redirects=False,
        )

    # Extract provisional token from redirect URL
    location = redirect.headers["location"]
    provisional_token = location.split("provisional=")[1]

    # Complete signup
    resp = await client.post(
        "/auth/google/complete-signup",
        json={
            "provisional_token": provisional_token,
            "org_name": "Google Signup Firm",
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert "tokens" in body
    assert "access_token" in body["tokens"]
    assert body["organisation"]["name"] == "Google Signup Firm"
    assert body["organisation"]["plan"] == "free"

    # Verify trial was started
    token = body["tokens"]["access_token"]
    sub_resp = await client.get(
        "/billing/subscription",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert sub_resp.status_code == 200
    sub = sub_resp.json()
    assert sub["trial_active"] is True
    assert sub["trial_ends_at"] is not None
    assert sub["effective_plan"] == "trial"


@pytest.mark.asyncio
async def test_provisional_token_cannot_be_reused(client: AsyncClient):
    """Completing signup twice with the same provisional token is rejected."""
    new_user = {**GOOGLE_USER, "sub": "new-google-id-333", "email": "reuse@googletest.ng"}

    with mock_google_fetch(new_user):
        redirect = await client.get(
            "/auth/google/callback?code=fake_code&state=fake_state",
            follow_redirects=False,
        )
    provisional = redirect.headers["location"].split("provisional=")[1]

    await client.post(
        "/auth/google/complete-signup",
        json={
            "provisional_token": provisional,
            "org_name": "First Org",
        },
    )
    # Second attempt
    resp = await client.post(
        "/auth/google/complete-signup",
        json={
            "provisional_token": provisional,
            "org_name": "Second Org",
        },
    )
    assert resp.status_code == 409


# ─── Existing user account linking ───────────────────────────────────────────


@pytest.mark.asyncio
async def test_existing_email_user_gets_google_linked(client: AsyncClient):
    """
    A user who registered with email+password and then signs in with Google
    (same email) gets their Google account linked automatically.
    """
    # Register normally first
    await client.post("/auth/register", json=REGISTER)

    google_user = {**GOOGLE_USER, "email": REGISTER["email"], "sub": "link-google-id-444"}
    with mock_google_fetch(google_user):
        resp = await client.get(
            "/auth/google/callback?code=fake_code&state=fake_state",
            follow_redirects=False,
        )

    # Should redirect to /login?tokens=... (existing user, not /onboarding)
    location = resp.headers["location"]
    assert "/login" in location
    assert "tokens=" in location


@pytest.mark.asyncio
async def test_existing_google_user_logs_in_directly(client: AsyncClient):
    """
    A user who previously signed in with Google is recognised by google_oauth_id
    and logged in without needing to complete signup again.
    """
    new_user = {**GOOGLE_USER, "sub": "returning-google-id-555", "email": "returning@googletest.ng"}

    # First sign-in — create account
    with mock_google_fetch(new_user):
        r1 = await client.get(
            "/auth/google/callback?code=fake_code&state=fake_state",
            follow_redirects=False,
        )
    provisional = r1.headers["location"].split("provisional=")[1]
    await client.post(
        "/auth/google/complete-signup",
        json={
            "provisional_token": provisional,
            "org_name": "Returning User Firm",
        },
    )

    # Second sign-in — should redirect to /login with tokens directly
    with mock_google_fetch(new_user):
        r2 = await client.get(
            "/auth/google/callback?code=fake_code&state=fake_state",
            follow_redirects=False,
        )
    location = r2.headers["location"]
    assert "/login" in location
    assert "tokens=" in location


@pytest.mark.asyncio
async def test_conflicting_google_accounts_rejected(client: AsyncClient):
    """
    If a user already has google_oauth_id=A linked and tries to sign in
    with google_oauth_id=B (same email), it should be rejected.
    """
    new_user = {**GOOGLE_USER, "sub": "conflict-id-A", "email": "conflict@googletest.ng"}

    with mock_google_fetch(new_user):
        r1 = await client.get(
            "/auth/google/callback?code=fake_code&state=fake_state",
            follow_redirects=False,
        )
    provisional = r1.headers["location"].split("provisional=")[1]
    await client.post(
        "/auth/google/complete-signup",
        json={
            "provisional_token": provisional,
            "org_name": "Conflict Firm",
        },
    )

    # Try to sign in with DIFFERENT Google ID but same email
    conflict_user = {**new_user, "sub": "conflict-id-B"}
    with mock_google_fetch(conflict_user):
        r2 = await client.get(
            "/auth/google/callback?code=fake_code&state=fake_state",
            follow_redirects=False,
        )
    # Should redirect to frontend with an error, not tokens
    location = r2.headers.get("location", "")
    assert "tokens=" not in location


# ─── Trial on regular registration ───────────────────────────────────────────


@pytest.mark.asyncio
async def test_regular_registration_starts_trial(client: AsyncClient):
    """
    Email/password registration also gets a 30-day trial.
    """
    reg_data = {**REGISTER, "email": "trial@googletest.ng", "org_name": "Trial Reg Org"}
    resp = await client.post("/auth/register", json=reg_data)
    assert resp.status_code == 201
    token = resp.json()["tokens"]["access_token"]

    sub = (
        await client.get(
            "/billing/subscription",
            headers={"Authorization": f"Bearer {token}"},
        )
    ).json()
    assert sub["trial_active"] is True
    assert sub["effective_plan"] == "trial"
    assert sub["features"]["drive_integration"] is True
    assert sub["features"]["reports"] is True


@pytest.mark.asyncio
async def test_trial_plan_allows_unlimited_matters(client: AsyncClient):
    """During trial, the matter limit is None (unlimited)."""
    reg_data = {**REGISTER, "email": "trialmatters@googletest.ng", "org_name": "Trial Matters Org"}
    resp = await client.post("/auth/register", json=reg_data)
    token = resp.json()["tokens"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    cl = (await client.post("/clients/", json={"name": "Trial Client"}, headers=headers)).json()

    # Create 6 matters — free plan only allows 5, but trial allows unlimited
    for i in range(6):
        r = await client.post(
            "/matters/",
            json={
                "title": f"Trial Matter {i+1}",
                "matter_type": "advisory",
                "client_id": cl["id"],
            },
            headers=headers,
        )
        assert r.status_code == 201, f"Matter {i+1} failed: {r.json()}"
