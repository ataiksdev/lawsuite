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
    assert body["trial_active"] is False
    assert body["trial_days_remaining"] is None


@pytest.mark.asyncio
async def test_get_subscription_trial_days_remaining_is_server_computed(client: AsyncClient):
    """
    trial_days_remaining must come from the server's own clock, not the
    client's — a freshly registered org is 30 days into its trial window.
    """
    token = await get_admin_token(client)

    resp = await client.get(
        "/billing/subscription",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["trial_active"] is True
    assert body["trial_days_remaining"] == 30


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

    # Verify callback_url and cancel_action include the admin billing hash route
    call_args = mock_instance.transactions.initialize.call_args[1]
    assert "/#/admin/billing" in call_args["callback_url"]
    assert "/#/admin/billing" in call_args["metadata"]["cancel_action"]
    customer_args = mock_instance.customers.create.call_args[1]
    assert customer_args["email"] == REGISTER["email"]
    assert customer_args["first_name"] == "Emeka"
    assert customer_args["last_name"] == "Obi"


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
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_verify_checkout_updates_subscription(client: AsyncClient, db_session):
    from sqlalchemy import select

    from app.models.organisation import Organisation

    token = await get_admin_token(client)

    verify_response = MagicMock()
    verify_response.status = True
    verify_response.data = MagicMock(
        status="success",
        metadata={"plan": "agency"},
        customer=MagicMock(customer_code="CUS_verify123"),
    )
    verify_response.data.metadata["org_id"] = None

    with patch("pypaystack2.AsyncPaystackClient") as MockClient:
        mock_instance = MockClient.return_value
        mock_instance.transactions.verify = AsyncMock(return_value=verify_response)

        resp = await client.get(
            "/billing/verify",
            params={"reference": "ref_verify_123"},
            headers={"Authorization": f"Bearer {token}"},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["verified"] is True
    assert body["plan"] == "agency"
    assert body["subscription"]["plan"] == "agency"

    result = await db_session.execute(select(Organisation))
    org = result.scalar_one()
    assert org.plan == "agency"
    assert org.paystack_customer_code == "CUS_verify123"
    assert org.trial_used is True


@pytest.mark.asyncio
async def test_verify_checkout_amount_fallback_detects_plan(client: AsyncClient, db_session):
    """
    If a transaction has no usable metadata and no recognisable plan_code,
    verify_transaction should still detect the plan as a last resort by
    matching the charged amount against PLAN_FEATURES.
    """
    from sqlalchemy import select

    from app.models.organisation import Organisation

    token = await get_admin_token(client)

    verify_response = MagicMock()
    verify_response.status = True
    verify_response.data = MagicMock(
        status="success",
        metadata={},
        plan=None,
        amount=500000,  # matches Pro's amount_kobo exactly — the only signal present
        customer=MagicMock(customer_code="CUS_amountfallback"),
    )

    with patch("pypaystack2.AsyncPaystackClient") as MockClient:
        mock_instance = MockClient.return_value
        mock_instance.transactions.verify = AsyncMock(return_value=verify_response)

        resp = await client.get(
            "/billing/verify",
            params={"reference": "ref_amount_fallback"},
            headers={"Authorization": f"Bearer {token}"},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["plan"] == "pro"

    result = await db_session.execute(select(Organisation))
    org = result.scalar_one()
    assert org.plan == "pro"
    assert org.paystack_customer_code == "CUS_amountfallback"
    assert org.trial_used is True


# ─── GET /billing/history ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_billing_history_empty_by_default(client: AsyncClient):
    token = await get_admin_token(client)
    resp = await client.get(
        "/billing/history",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_billing_history_populated_from_charge_success(client: AsyncClient, db_session):
    import asyncio
    import hashlib
    import hmac
    import json
    from contextlib import asynccontextmanager

    from app.core.config import settings

    reg = await client.post(
        "/auth/register", json={**REGISTER, "email": "history@billingtest.ng", "org_name": "History Org"}
    )
    token = reg.json()["tokens"]["access_token"]
    org_id = reg.json()["organisation"]["id"]

    payload = json.dumps(
        {
            "event": "charge.success",
            "data": {
                "reference": "ref_history_test",
                "amount": 500000,
                "paid_at": "2026-02-01T09:00:00.000Z",
                "metadata": {"org_id": org_id, "plan": "pro"},
            },
        }
    ).encode()
    sig = hmac.new(settings.paystack_secret_key.encode(), payload, hashlib.sha512).hexdigest()

    @asynccontextmanager
    async def override_session_local():
        yield db_session

    with patch("app.api.webhooks.AsyncSessionLocal", side_effect=override_session_local):
        resp = await client.post(
            "/webhooks/paystack",
            content=payload,
            headers={"Content-Type": "application/json", "x-paystack-signature": sig},
        )
    assert resp.status_code == 200
    await asyncio.sleep(0.1)

    resp = await client.get(
        "/billing/history",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["reference"] == "ref_history_test"
    assert body[0]["plan"] == "pro"
    assert body[0]["amount_ngn"] == 5000


# ─── POST /billing/cancel ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_cancel_subscription_without_subscription_rejected(client: AsyncClient):
    token = await get_admin_token(client)
    resp = await client.post(
        "/billing/cancel",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_cancel_subscription_downgrades_to_free(client: AsyncClient, db_session):
    from sqlalchemy import select

    from app.models.organisation import Organisation

    reg = await client.post(
        "/auth/register", json={**REGISTER, "email": "cancel@billingtest.ng", "org_name": "Cancel Org"}
    )
    token = reg.json()["tokens"]["access_token"]
    org_id = reg.json()["organisation"]["id"]

    result = await db_session.execute(select(Organisation).where(Organisation.id == org_id))
    org = result.scalar_one()
    org.plan = "pro"
    org.paystack_customer_code = "CUS_canceltest"
    org.paystack_subscription_code = "SUB_canceltest"
    org.paystack_subscription_email_token = "EMTOK_canceltest"
    await db_session.commit()

    mock_response = MagicMock()
    mock_response.status = True

    with patch("pypaystack2.AsyncPaystackClient") as MockClient:
        mock_instance = MockClient.return_value
        mock_instance.subscriptions.disable = AsyncMock(return_value=mock_response)

        resp = await client.post(
            "/billing/cancel",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["cancelled"] is True
    assert body["plan"] == "free"
    mock_instance.subscriptions.disable.assert_awaited_once_with(
        code="SUB_canceltest", token="EMTOK_canceltest"
    )

    result = await db_session.execute(select(Organisation).where(Organisation.id == org_id))
    org = result.scalar_one()
    assert org.plan == "free"
    assert org.paystack_subscription_code is None
    assert org.paystack_subscription_email_token is None


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
                "reference": "ref_charge_success_test",
                "amount": 500000,
                "paid_at": "2026-01-15T10:00:00.000Z",
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

    # Retried webhook delivery (same reference) must be a no-op, not a
    # duplicate ledger row or a second "plan upgraded" notification.
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
    await asyncio.sleep(0.1)

    from app.models.billing_transaction import BillingTransaction

    result = await db_session.execute(
        select(BillingTransaction).where(BillingTransaction.organisation_id == org_id)
    )
    assert len(result.scalars().all()) == 1


@pytest.mark.asyncio
async def test_webhook_stale_disable_does_not_undo_plan_switch(client: AsyncClient, db_session):
    """
    Upgrading pro -> agency disables the old subscription while creating a new
    one. If the disable event for the OLD subscription arrives after the
    create event for the NEW one, it must not downgrade an org that just
    upgraded — only a disable event matching the org's current subscription
    code should downgrade it.
    """
    import asyncio
    import hashlib
    import hmac
    import json
    from contextlib import asynccontextmanager
    from unittest.mock import patch

    from sqlalchemy import select

    from app.core.config import settings
    from app.models.organisation import Organisation

    reg = await client.post(
        "/auth/register", json={**REGISTER, "email": "planswitch@billingtest.ng", "org_name": "Plan Switch Org"}
    )
    org_id = reg.json()["organisation"]["id"]

    async def send_webhook(event: str, data: dict) -> None:
        payload = json.dumps({"event": event, "data": data}).encode()
        sig = hmac.new(settings.paystack_secret_key.encode(), payload, hashlib.sha512).hexdigest()

        @asynccontextmanager
        async def override_session_local():
            yield db_session

        with patch("app.api.webhooks.AsyncSessionLocal", side_effect=override_session_local):
            resp = await client.post(
                "/webhooks/paystack",
                content=payload,
                headers={"Content-Type": "application/json", "x-paystack-signature": sig},
            )
        assert resp.status_code == 200
        await asyncio.sleep(0.1)

    customer_code = "CUS_planswitch_test"

    result = await db_session.execute(select(Organisation).where(Organisation.id == org_id))
    org = result.scalar_one()
    org.paystack_customer_code = customer_code
    await db_session.commit()

    # Subscribes to Pro
    await send_webhook(
        "subscription.create",
        {
            "customer": {"customer_code": customer_code},
            "plan": {"plan_code": settings.paystack_pro_plan_code},
            "subscription_code": "SUB_pro_old",
        },
    )
    result = await db_session.execute(select(Organisation).where(Organisation.id == org_id))
    assert result.scalar_one().plan == "pro"

    # Upgrades to Agency — Paystack creates a new subscription
    await send_webhook(
        "subscription.create",
        {
            "customer": {"customer_code": customer_code},
            "plan": {"plan_code": settings.paystack_agency_plan_code},
            "subscription_code": "SUB_agency_new",
        },
    )
    result = await db_session.execute(select(Organisation).where(Organisation.id == org_id))
    assert result.scalar_one().plan == "agency"

    # The old Pro subscription's disable event arrives late — must NOT downgrade
    await send_webhook(
        "subscription.disable",
        {
            "customer": {"customer_code": customer_code},
            "subscription_code": "SUB_pro_old",
        },
    )
    result = await db_session.execute(select(Organisation).where(Organisation.id == org_id))
    assert result.scalar_one().plan == "agency"

    # The CURRENT subscription is genuinely disabled — this one should downgrade
    await send_webhook(
        "subscription.disable",
        {
            "customer": {"customer_code": customer_code},
            "subscription_code": "SUB_agency_new",
        },
    )
    result = await db_session.execute(select(Organisation).where(Organisation.id == org_id))
    assert result.scalar_one().plan == "free"


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
async def test_drive_integration_blocked_after_downgrade(client: AsyncClient, db_session):
    """
    Drive/Gmail endpoints must re-check billing on every call, not just at the
    initial Google connect step — an org that connected while on a paid/trial
    plan and is later downgraded should lose access, not keep it forever.
    """
    from unittest.mock import MagicMock

    from sqlalchemy import select

    from app.core.deps import get_google_credentials
    from app.main import app
    from app.models.organisation import Organisation

    reg = await client.post(
        "/auth/register", json={**REGISTER, "email": "drivegate@billingtest.ng", "org_name": "Drive Gate Org"}
    )
    token = reg.json()["tokens"]["access_token"]
    org_id = reg.json()["organisation"]["id"]
    headers = {"Authorization": f"Bearer {token}"}

    # Pretend Google is already connected (bypasses the separate "not connected" 400)
    app.dependency_overrides[get_google_credentials] = lambda: MagicMock()
    try:
        # End the trial — org falls back to the free plan, which has drive_integration=False
        result = await db_session.execute(select(Organisation).where(Organisation.id == org_id))
        org = result.scalar_one()
        org.trial_used = True
        await db_session.commit()

        resp = await client.get("/matters/00000000-0000-0000-0000-000000000000/inbox", headers=headers)
        assert resp.status_code == 402
        assert "upgrade" in resp.json()["detail"].lower()
    finally:
        app.dependency_overrides.pop(get_google_credentials, None)


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
