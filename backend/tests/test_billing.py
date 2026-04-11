# backend/tests/api/test_billing.py
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient

REGISTER = {
    "org_name": "Billing Test Firm",
    "full_name": "Emeka Obi",
    "email": "emeka@billingtest.ng",
    "password": "TestPass123",
}


async def get_admin_token(client: AsyncClient) -> str:
    reg = await client.post("/auth/register", json=REGISTER)
    return reg.json()["tokens"]["access_token"]


# ─── GET /billing/subscription ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_subscription_default_free(client: AsyncClient, db_session):
    from sqlalchemy import select

    from app.models.organisation import Organisation

    token = await get_admin_token(client)

    # End trial to test pure free plan
    result = await db_session.execute(select(Organisation))
    org = result.scalar_one()
    org.trial_used = True
    await db_session.commit()

    resp = await client.get(
        "/billing/subscription",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["plan"] == "free"
    assert body["limits"]["max_matters"] == 5
    assert body["limits"]["max_seats"] == 1
    assert body["features"]["drive_integration"] is False
    assert body["features"]["reports"] is False


# ─── POST /billing/checkout ───────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_checkout_pro_returns_authorization_url(client: AsyncClient):
    token = await get_admin_token(client)

    mock_response = MagicMock()
    mock_response.status = True
    mock_response.data = MagicMock(
        authorization_url="https://checkout.paystack.com/mock123",
        reference="ref_mock_123",
        access_code="acc_mock_456",
    )

    mock_cust_response = MagicMock()
    mock_cust_response.status = True
    mock_cust_response.data = MagicMock(customer_code="CUS_testcustomer")

    with patch(
        "pypaystack2.AsyncPaystackClient",
    ) as MockClient:
        mock_instance = MockClient.return_value
        mock_instance.customers.create = AsyncMock(return_value=mock_cust_response)
        mock_instance.transactions.initialize = AsyncMock(return_value=mock_response)

        resp = await client.post(
            "/billing/checkout",
            json={"plan": "pro"},
            headers={"Authorization": f"Bearer {token}"},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert "authorization_url" in body
    assert "reference" in body
    assert "checkout.paystack.com" in body["authorization_url"]

    # Verify callback_url and cancel_action include the /#/ hash prefix
    call_args = mock_instance.transactions.initialize.call_args[1]
    assert "/#/settings/billing" in call_args["callback_url"]
    assert "/#/settings/billing" in call_args["metadata"]["cancel_action"]


@pytest.mark.asyncio
async def test_checkout_invalid_plan_rejected(client: AsyncClient):
    token = await get_admin_token(client)
    resp = await client.post(
        "/billing/checkout",
        json={"plan": "enterprise"},  # not a valid plan
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_checkout_requires_admin(client: AsyncClient):
    resp = await client.post("/billing/checkout", json={"plan": "pro"})
    assert resp.status_code == 403


# ─── GET /billing/portal ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_billing_portal_without_subscription(client: AsyncClient):
    token = await get_admin_token(client)
    resp = await client.get(
        "/billing/portal",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_billing_portal_with_subscription(client: AsyncClient, db_session):
    from sqlalchemy import select

    from app.models.organisation import Organisation

    reg = await client.post(
        "/auth/register", json={**REGISTER, "email": "portal@billingtest.ng", "org_name": "Portal Org"}
    )
    token = reg.json()["tokens"]["access_token"]
    org_id = reg.json()["organisation"]["id"]

    result = await db_session.execute(select(Organisation).where(Organisation.id == org_id))
    org = result.scalar_one()
    org.paystack_customer_code = "CUS_testportal"
    await db_session.commit()

    resp = await client.get(
        "/billing/portal",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert "portal_url" in resp.json()
    assert "paystack.com" in resp.json()["portal_url"]


# ─── Paystack webhook ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_webhook_invalid_signature_rejected(client: AsyncClient):
    resp = await client.post(
        "/webhooks/paystack",
        content=b'{"event":"charge.success","data":{}}',
        headers={
            "Content-Type": "application/json",
            "x-paystack-signature": "invalidsignature",
        },
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_webhook_charge_success_activates_plan(client: AsyncClient, db_session):
    import hashlib
    import hmac
    import json

    from sqlalchemy import select

    from app.models.organisation import Organisation

    reg = await client.post(
        "/auth/register", json={**REGISTER, "email": "webhook@billingtest.ng", "org_name": "Webhook Org"}
    )
    org_id = reg.json()["organisation"]["id"]

    payload = json.dumps(
        {
            "event": "charge.success",
            "data": {
                "metadata": {"org_id": org_id, "plan": "pro"},
            },
        }
    ).encode()

    # Sign with the test secret key from settings
    from app.core.config import settings

    sig = hmac.new(
        settings.paystack_secret_key.encode(),
        payload,
        hashlib.sha512,
    ).hexdigest()

    from contextlib import asynccontextmanager
    from unittest.mock import patch

    @asynccontextmanager
    async def override_session_local():
        yield db_session

    with patch("app.api.webhooks.AsyncSessionLocal", side_effect=override_session_local):
        resp = await client.post(
            "/webhooks/paystack",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "x-paystack-signature": sig,
            },
        )
    assert resp.status_code == 200

    # Give the background task time to run
    import asyncio

    await asyncio.sleep(0.1)

    result = await db_session.execute(select(Organisation).where(Organisation.id == org_id))
    org = result.scalar_one()
    assert org.plan == "pro"


# ─── Plan limit enforcement ───────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_matter_limit_enforced_on_free_plan(client: AsyncClient, db_session):
    from sqlalchemy import select

    from app.models.organisation import Organisation

    """Free plan allows max 5 matters — 6th should return 402."""
    reg = await client.post(
        "/auth/register", json={**REGISTER, "email": "limit@billingtest.ng", "org_name": "Limit Org"}
    )
    token = reg.json()["tokens"]["access_token"]
    org_id = reg.json()["organisation"]["id"]

    # End trial
    result = await db_session.execute(select(Organisation).where(Organisation.id == org_id))
    org = result.scalar_one()
    org.trial_used = True
    await db_session.commit()

    headers = {"Authorization": f"Bearer {token}"}

    cl = await client.post("/clients/", json={"name": "Limit Client"}, headers=headers)
    client_id = cl.json()["id"]

    for i in range(5):
        resp = await client.post(
            "/matters/",
            json={
                "title": f"Matter {i+1}",
                "matter_type": "advisory",
                "client_id": client_id,
            },
            headers=headers,
        )
        assert resp.status_code == 201

    # 6th matter should be blocked
    resp = await client.post(
        "/matters/",
        json={
            "title": "Over limit matter",
            "matter_type": "advisory",
            "client_id": client_id,
        },
        headers=headers,
    )
    assert resp.status_code == 402
    assert "upgrade" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_seat_limit_enforced_on_free_plan(client: AsyncClient, db_session):
    from sqlalchemy import select

    from app.models.organisation import Organisation

    """Free plan allows 1 seat — inviting a second member should return 402."""
    reg = await client.post("/auth/register", json={**REGISTER, "email": "seat@billingtest.ng", "org_name": "Seat Org"})
    token = reg.json()["tokens"]["access_token"]
    org_id = reg.json()["organisation"]["id"]

    # End trial
    result = await db_session.execute(select(Organisation).where(Organisation.id == org_id))
    org = result.scalar_one()
    org.trial_used = True
    await db_session.commit()

    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post(
        "/auth/invite",
        json={
            "email": "second@seattest.ng",
            "full_name": "Second User",
            "role": "member",
        },
        headers=headers,
    )
    assert resp.status_code == 402
    assert "upgrade" in resp.json()["detail"].lower()
