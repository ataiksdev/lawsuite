# backend/tests/api/test_mfa.py

import pyotp
import pytest
from httpx import AsyncClient

REGISTER = {
    "org_name": "MFA Test Firm",
    "full_name": "Adaeze Okafor",
    "email": "adaeze@mfatest.ng",
    "password": "TestPass123",
}


async def get_token(client: AsyncClient, payload: dict = REGISTER) -> str:
    reg = await client.post("/auth/register", json=payload)
    body = reg.json()
    assert "access_token" in body["tokens"], f"Unexpected body: {body}"
    return body["tokens"]["access_token"]


# ─── MFA status ───────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_mfa_status_disabled_by_default(client: AsyncClient):
    token = await get_token(client)
    resp = await client.get("/auth/mfa/status", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["mfa_enabled"] is False
    assert resp.json()["backup_codes_remaining"] == 0


# ─── MFA setup ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_mfa_setup_returns_qr_and_secret(client: AsyncClient):
    token = await get_token(client)
    resp = await client.post("/auth/mfa/setup", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    body = resp.json()
    assert "qr_code_svg" in body
    assert "otpauth_uri" in body
    assert "secret" in body
    assert body["otpauth_uri"].startswith("otpauth://totp/")
    assert "<svg" in body["qr_code_svg"]


@pytest.mark.asyncio
async def test_mfa_setup_twice_rejected(client: AsyncClient):
    """Cannot re-setup while MFA is already enabled."""
    token = await get_token(client)
    headers = {"Authorization": f"Bearer {token}"}

    # Setup and verify first
    setup = (await client.post("/auth/mfa/setup", headers=headers)).json()
    secret = setup["secret"]
    code = pyotp.TOTP(secret).now()
    await client.post("/auth/mfa/verify", json={"code": code}, headers=headers)

    # Second setup should fail
    resp = await client.post("/auth/mfa/setup", headers=headers)
    assert resp.status_code == 400


# ─── MFA verify (activate) ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_mfa_verify_activates_and_returns_backup_codes(client: AsyncClient):
    token = await get_token(client)
    headers = {"Authorization": f"Bearer {token}"}

    setup = (await client.post("/auth/mfa/setup", headers=headers)).json()
    secret = setup["secret"]
    code = pyotp.TOTP(secret).now()

    resp = await client.post("/auth/mfa/verify", json={"code": code}, headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert "backup_codes" in body
    assert len(body["backup_codes"]) == 8
    assert "warning" in body

    # Status should now show enabled
    status_resp = (await client.get("/auth/mfa/status", headers=headers)).json()
    assert status_resp["mfa_enabled"] is True
    assert status_resp["backup_codes_remaining"] == 8


@pytest.mark.asyncio
async def test_mfa_verify_bad_code_rejected(client: AsyncClient):
    token = await get_token(client)
    headers = {"Authorization": f"Bearer {token}"}

    await client.post("/auth/mfa/setup", headers=headers)

    resp = await client.post("/auth/mfa/verify", json={"code": "000000"}, headers=headers)
    assert resp.status_code == 401


# ─── Login with MFA ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_login_returns_mfa_pending_when_mfa_enabled(client: AsyncClient):
    reg_data = {**REGISTER, "email": "mfalogin@mfatest.ng", "org_name": "MFA Login Org"}
    token = await get_token(client, reg_data)
    headers = {"Authorization": f"Bearer {token}"}

    # Enable MFA
    setup = (await client.post("/auth/mfa/setup", headers=headers)).json()
    secret = setup["secret"]
    code = pyotp.TOTP(secret).now()
    await client.post("/auth/mfa/verify", json={"code": code}, headers=headers)

    # Login — should return mfa_required=True
    login_resp = await client.post(
        "/auth/login",
        json={
            "email": reg_data["email"],
            "password": reg_data["password"],
        },
    )
    assert login_resp.status_code == 200
    body = login_resp.json()
    assert body["mfa_required"] is True
    assert "mfa_token" in body
    assert "access_token" not in body


@pytest.mark.asyncio
async def test_mfa_validate_completes_login(client: AsyncClient):
    reg_data = {**REGISTER, "email": "mfavalidate@mfatest.ng", "org_name": "MFA Validate Org"}
    token = await get_token(client, reg_data)
    headers = {"Authorization": f"Bearer {token}"}

    # Enable MFA
    setup = (await client.post("/auth/mfa/setup", headers=headers)).json()
    secret = setup["secret"]
    code = pyotp.TOTP(secret).now()
    await client.post("/auth/mfa/verify", json={"code": code}, headers=headers)

    # Login step 1 — get mfa_token
    login_resp = await client.post(
        "/auth/login",
        json={
            "email": reg_data["email"],
            "password": reg_data["password"],
        },
    )
    mfa_token = login_resp.json()["mfa_token"]

    # Login step 2 — validate TOTP
    fresh_code = pyotp.TOTP(secret).now()
    validate_resp = await client.post(
        "/auth/mfa/validate",
        json={
            "mfa_token": mfa_token,
            "code": fresh_code,
        },
    )
    assert validate_resp.status_code == 200
    body = validate_resp.json()
    assert "access_token" in body
    assert body["mfa_required"] is False


@pytest.mark.asyncio
async def test_mfa_validate_wrong_code_rejected(client: AsyncClient):
    reg_data = {**REGISTER, "email": "mfabadcode@mfatest.ng", "org_name": "MFA Bad Code Org"}
    token = await get_token(client, reg_data)
    headers = {"Authorization": f"Bearer {token}"}

    setup = (await client.post("/auth/mfa/setup", headers=headers)).json()
    secret = setup["secret"]
    code = pyotp.TOTP(secret).now()
    await client.post("/auth/mfa/verify", json={"code": code}, headers=headers)

    login_resp = await client.post("/auth/login", json={"email": reg_data["email"], "password": reg_data["password"]})
    mfa_token = login_resp.json()["mfa_token"]

    validate_resp = await client.post(
        "/auth/mfa/validate",
        json={
            "mfa_token": mfa_token,
            "code": "999999",
        },
    )
    assert validate_resp.status_code == 401


# ─── Backup codes ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_backup_code_works_as_mfa_code(client: AsyncClient):
    reg_data = {**REGISTER, "email": "backup@mfatest.ng", "org_name": "Backup Code Org"}
    token = await get_token(client, reg_data)
    headers = {"Authorization": f"Bearer {token}"}

    setup = (await client.post("/auth/mfa/setup", headers=headers)).json()
    secret = setup["secret"]
    code = pyotp.TOTP(secret).now()
    verify_resp = (await client.post("/auth/mfa/verify", json={"code": code}, headers=headers)).json()
    backup_code = verify_resp["backup_codes"][0]

    login_resp = await client.post("/auth/login", json={"email": reg_data["email"], "password": reg_data["password"]})
    mfa_token = login_resp.json()["mfa_token"]

    # Use backup code instead of TOTP
    validate_resp = await client.post(
        "/auth/mfa/validate",
        json={
            "mfa_token": mfa_token,
            "code": backup_code,
        },
    )
    assert validate_resp.status_code == 200

    # Backup code is now consumed — backup_codes_remaining should be 7
    status_resp = (await client.get("/auth/mfa/status", headers=headers)).json()
    assert status_resp["backup_codes_remaining"] == 7


@pytest.mark.asyncio
async def test_backup_code_cannot_be_reused(client: AsyncClient):
    """Each backup code is single-use."""
    reg_data = {**REGISTER, "email": "reuse@mfatest.ng", "org_name": "Reuse Org"}
    token = await get_token(client, reg_data)
    headers = {"Authorization": f"Bearer {token}"}

    setup = (await client.post("/auth/mfa/setup", headers=headers)).json()
    secret = setup["secret"]
    code = pyotp.TOTP(secret).now()
    verify_resp = (await client.post("/auth/mfa/verify", json={"code": code}, headers=headers)).json()
    backup_code = verify_resp["backup_codes"][0]

    # Use it once
    login1 = await client.post("/auth/login", json={"email": reg_data["email"], "password": reg_data["password"]})
    await client.post("/auth/mfa/validate", json={"mfa_token": login1.json()["mfa_token"], "code": backup_code})

    # Try to reuse it
    login2 = await client.post("/auth/login", json={"email": reg_data["email"], "password": reg_data["password"]})
    resp = await client.post("/auth/mfa/validate", json={"mfa_token": login2.json()["mfa_token"], "code": backup_code})
    assert resp.status_code == 401


# ─── Disable MFA ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_disable_mfa(client: AsyncClient):
    reg_data = {**REGISTER, "email": "disable@mfatest.ng", "org_name": "Disable MFA Org"}
    token = await get_token(client, reg_data)
    headers = {"Authorization": f"Bearer {token}"}

    setup = (await client.post("/auth/mfa/setup", headers=headers)).json()
    secret = setup["secret"]
    code = pyotp.TOTP(secret).now()
    await client.post("/auth/mfa/verify", json={"code": code}, headers=headers)

    disable_code = pyotp.TOTP(secret).now()
    resp = await client.post("/auth/mfa/disable", json={"code": disable_code}, headers=headers)
    assert resp.status_code == 204

    status_resp = (await client.get("/auth/mfa/status", headers=headers)).json()
    assert status_resp["mfa_enabled"] is False


# ─── Login without MFA (no regression) ───────────────────────────────────────


@pytest.mark.asyncio
async def test_login_without_mfa_returns_tokens_directly(client: AsyncClient):
    reg_data = {**REGISTER, "email": "nomfa@mfatest.ng", "org_name": "No MFA Org"}
    await client.post("/auth/register", json=reg_data)

    resp = await client.post("/auth/login", json={"email": reg_data["email"], "password": reg_data["password"]})
    assert resp.status_code == 200
    body = resp.json()
    assert body["mfa_required"] is False
    assert "access_token" in body
