# backend/app/services/billing_service.py
import uuid
import hmac
import hashlib
import math
from datetime import datetime, timezone
from typing import Any, Literal
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException, status

from app.core.config import settings
from app.models.billing_transaction import BillingTransaction
from app.models.organisation import Organisation
from app.services.notification_service import NotificationService


# Plan definitions — amounts in Kobo (NGN × 100)
PLAN_FEATURES = {
    "free": {
        "name": "Free",
        "plan_code": settings.paystack_free_plan_code,
        "amount_kobo": 0,
        "max_matters": 5,
        "max_seats": 1,
        "drive_integration": False,
        "reports": False,
        # "mfa": True,              # MFA always available for security
        "advanced_tasks": False,
        "api_access": False,
    },
    "pro": {
        "name": "Pro",
        "plan_code": settings.paystack_pro_plan_code,
        "amount_kobo": 500_000,   # ₦5,000/month
        "max_matters": None,         # unlimited
        "max_seats": 5,
        "drive_integration": True,
        "reports": True,
        "mfa": True,              # MFA always available for security
        "advanced_tasks": False,
        "api_access": False,
    },
    "agency": {
        "name": "Agency",
        "plan_code": settings.paystack_agency_plan_code,
        "amount_kobo": 2_000_000,   # ₦20,000/month
        "max_matters": None,
        "max_seats": None,           # unlimited
        "drive_integration": True,
        "reports": True,
        "mfa": True,              # MFA always available for security
        "advanced_tasks": True,
        "api_access": True,
    },
    "trial": {
        "name": "Free Trial",
        "plan_code": "",
        "amount_kobo": 0,
        "max_matters": None,        # full access during trial
        "max_seats": 5,
        "drive_integration": True,
        "reports": True,
        "mfa": True,
        "advanced_tasks": True,
        "api_access": False,
    },

}

def _load_plan_codes() -> None:
    """Inject Paystack plan codes from settings at startup."""
    PLAN_FEATURES["free"]["plan_code"] = settings.paystack_free_plan_code
    PLAN_FEATURES["pro"]["plan_code"] = settings.paystack_pro_plan_code
    PLAN_FEATURES["agency"]["plan_code"] = settings.paystack_agency_plan_code


_load_plan_codes()

# ── Webhook verification ──────────────────────────────────────────────────────


def verify_paystack_signature(payload: bytes, signature: str) -> bool:
    """
    Verify a Paystack webhook signature.

    Paystack signs webhook payloads using HMAC SHA512 with the secret key.
    The signature is sent in the x-paystack-signature header.
    We must verify this before processing any webhook event.

    See: https://paystack.com/docs/payments/webhooks/
    """
    computed = hmac.new(
        key=settings.paystack_secret_key.encode("utf-8"),
        msg=payload,
        digestmod=hashlib.sha512,
    ).hexdigest()
    # Use hmac.compare_digest for constant-time comparison (prevents timing attacks)
    return hmac.compare_digest(computed, signature)

# ── Effective plan resolution ─────────────────────────────────────────────────

def get_effective_plan(org: Organisation) -> tuple[str, dict]:
    """
    Determine what plan features the org actually gets right now.

    Resolution order (highest priority first):
      1. Per-org feature_flags overrides (set by platform admin)
      2. Active trial (trial_ends_at > now and trial_used is False)
      3. Paid plan

    Returns (effective_plan_name, features_dict).
    The features_dict has all feature keys with their resolved values.
    """
    now = datetime.now(timezone.utc)

    # Determine base plan
    if (
        org.trial_ends_at
        and org.trial_ends_at.replace(tzinfo=timezone.utc) > now
        and not org.trial_used
    ):
        plan_name = "trial"
    else:
        plan_name = org.plan

    # Start from plan defaults
    features = dict(PLAN_FEATURES.get(plan_name, PLAN_FEATURES["free"]))

    # Apply per-org overrides (platform admin can set individual flags)
    if org.feature_flags:
        for key, value in org.feature_flags.items():
            if key in features:
                features[key] = value

    return plan_name, features


def _read_value(source: Any, *path: str) -> Any:
    """
    Read nested values from either SDK objects or plain dicts.
    Paystack SDK responses can expose attributes while tests often use dicts/mocks.
    """
    value = source
    for key in path:
        if value is None:
            return None
        if isinstance(value, dict):
            value = value.get(key)
        else:
            value = getattr(value, key, None)
    return value


def _split_full_name(name: str) -> tuple[str | None, str | None]:
    """
    Paystack's customer API expects first_name/last_name, not full_name.
    """
    parts = [part for part in name.strip().split() if part]
    if not parts:
        return None, None
    if len(parts) == 1:
        return parts[0], None
    return parts[0], " ".join(parts[1:])

class BillingService:

    def __init__(self, db: AsyncSession):
        self.db = db
        self.notifications = NotificationService(db)

    async def _get_org(self, org_id: uuid.UUID, for_update: bool = False) -> Organisation:
        query = select(Organisation).where(Organisation.id == org_id)
        if for_update:
            # Serializes concurrent limit checks for the same org: the second
            # request's lock acquisition blocks until the first commits (or
            # rolls back), so its count query sees the first request's
            # already-committed insert instead of racing it.
            query = query.with_for_update()
        result = await self.db.execute(query)
        org = result.scalar_one_or_none()
        if not org:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Organisation not found",
            )
        return org

    # ── Paystack customer ─────────────────────────────────────────────────

    async def get_or_create_customer(
        self, org_id: uuid.UUID, email: str, name: str
    ) -> str:
        """
        Get or create a Paystack customer for this organisation.
        Returns the Paystack customer_code (e.g. CUS_xxxxxxxxxx).
        Stored on the org so we don't create duplicates.
        """
        from pypaystack2 import AsyncPaystackClient

        org = await self._get_org(org_id)
        if org.paystack_customer_code:
            return org.paystack_customer_code

        first_name, last_name = _split_full_name(name)
        client = AsyncPaystackClient(secret_key=settings.paystack_secret_key)
        response = await client.customers.create(
            email=email,
            first_name=first_name,
            last_name=last_name,
        )

        if not response.status:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Paystack customer creation failed: {response.message}",
            )

        org.paystack_customer_code = response.data.customer_code
        await self.db.commit()
        return response.data.customer_code

    # ── Initialise transaction / subscription ─────────────────────────────

    async def initialize_subscription(
        self,
        org_id: uuid.UUID,
        plan: Literal["pro", "agency"],
        callback_url: str,
        user_email: str,
    ) -> dict:
        """
        Initialise a Paystack subscription for an organisation.

        Returns {"authorization_url": ..., "reference": ...}
        Frontend redirects the user to authorization_url to complete payment.
        After payment Paystack calls our webhook and we activate the plan.
        """
        from pypaystack2 import AsyncPaystackClient
        if plan not in PLAN_FEATURES or plan in ("free", "trial"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid plan: {plan}. Choose 'pro' or 'agency'.",
            )

        plan_config = PLAN_FEATURES[plan]
        if not plan_config["plan_code"]:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Billing plan not configured. Contact support.",
            )

        client = AsyncPaystackClient(secret_key=settings.paystack_secret_key)
        response = await client.transactions.initialize(
            amount=plan_config["amount_kobo"],
            email=user_email,
            plan=plan_config["plan_code"],
            callback_url=callback_url,
            metadata={
                "org_id": str(org_id),
                "plan": plan,
                "cancel_action": f"{settings.frontend_url}/#/admin/billing?paystack=cancelled",
            },
        )

        if not response.status:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Paystack initialisation failed: {response.message}",
            )

        return {
            "authorization_url": response.data.authorization_url,
            "reference": response.data.reference,
            "access_code": response.data.access_code,
            "amount_kobo": plan_config["amount_kobo"],
        }

    async def verify_transaction(self, org_id: uuid.UUID, reference: str) -> dict:
        """
        Verify a Paystack transaction reference after redirecting back from checkout.
        This lets the frontend confirm the upgrade immediately instead of waiting
        for the webhook to update the organisation.
        """
        from pypaystack2 import AsyncPaystackClient

        org = await self._get_org(org_id)
        client = AsyncPaystackClient(secret_key=settings.paystack_secret_key)
        response = await client.transactions.verify(reference)

        if not response.status:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Paystack verification failed: {response.message}",
            )

        data = response.data
        payment_status = _read_value(data, "status")
        if payment_status != "success":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Payment has not been completed yet.",
            )

        metadata_source = _read_value(data, "metadata")
        if isinstance(metadata_source, str):
            import json
            try: metadata = json.loads(metadata_source)
            except: metadata = {}
        elif isinstance(metadata_source, dict): metadata = metadata_source
        else: metadata = {}

        metadata_org_id = metadata.get("org_id")
        plan = metadata.get("plan")

        # Fallback: detect plan from plan_code if missing from metadata
        plan_ref = _read_value(data, "plan")
        found_plan_code = plan_ref.get("plan_code") if isinstance(plan_ref, dict) else (plan_ref if isinstance(plan_ref, str) else None)

        if not plan and found_plan_code:
            for p_name, p_config in PLAN_FEATURES.items():
                if p_config.get("plan_code") == found_plan_code:
                    plan = p_name
                    break
        
        # Ultimate fallback: Detect plan by matching the amount paid against our PLAN_FEATURES config
        if not plan:
            amount_paid = _read_value(data, "amount")
            if amount_paid:
                for p_name, p_config in PLAN_FEATURES.items():
                    # Match paid plans by amount (excluding trial/free which are 0)
                    if p_config.get("amount_kobo") == amount_paid and p_config.get("amount_kobo", 0) > 0:
                        plan = p_name
                        break
        
        customer_code = _read_value(data, "customer", "customer_code")

        if metadata_org_id and metadata_org_id != str(org_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This payment reference belongs to a different organisation.",
            )

        if plan not in ("pro", "agency"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Payment reference is not linked to a paid billing plan.",
            )

        org.plan = plan
        org.trial_used = True
        if customer_code and not org.paystack_customer_code:
            org.paystack_customer_code = customer_code
        await self.db.commit()
        await self.db.refresh(org)

        await self.notifications.fan_out_to_org_admins(
            org_id=org_id, actor_id=uuid.UUID(int=0), type="success",
            title=f"Plan upgraded to {plan.capitalize()}",
            message="Your organisation's subscription is now active.", link="/admin/billing",
        )

        return {
            "verified": True,
            "reference": reference,
            "status": payment_status,
            "plan": org.plan,
            "subscription": await self.get_subscription(org_id),
        }

    # ── Webhook event handlers ────────────────────────────────────────────

    async def handle_charge_success(self, event_data: dict) -> None:
        """
        charge.success — payment completed.
        Records the transaction in our own ledger (so the app can show
        subscription history without Paystack) and activates the plan.

        Paystack retries webhook delivery, and retries can race each other,
        so this relies on the unique constraint on
        BillingTransaction.paystack_reference: inserting a reference that's
        already recorded raises IntegrityError, which we treat as "already
        processed" rather than repeating the plan update and notification.
        """
        metadata = event_data.get("metadata", {})
        org_id_str = metadata.get("org_id")
        plan = metadata.get("plan")
        reference = event_data.get("reference")

        if not org_id_str or not plan or reference is None:
            return  # Not a LegalOps subscription charge — ignore
        try:
            org_id = uuid.UUID(org_id_str)
        except ValueError:
            return

        if plan not in PLAN_FEATURES:
            return

        paid_at_raw = event_data.get("paid_at")
        try:
            paid_at = (
                datetime.fromisoformat(paid_at_raw.replace("Z", "+00:00"))
                if paid_at_raw else datetime.now(timezone.utc)
            )
        except ValueError:
            paid_at = datetime.now(timezone.utc)

        self.db.add(BillingTransaction(
            organisation_id=org_id,
            paystack_reference=str(reference),
            plan=plan,
            amount_kobo=event_data.get("amount") or PLAN_FEATURES[plan]["amount_kobo"],
            status="success",
            paid_at=paid_at,
        ))
        try:
            await self.db.commit()
        except IntegrityError:
            await self.db.rollback()
            return  # Already processed this exact charge — retried webhook delivery

        org = await self._get_org(org_id)
        org.plan = plan
        org.trial_used = True
        await self.db.commit()
        await self.notifications.fan_out_to_org_admins(
            org_id=org_id, actor_id=uuid.UUID(int=0), type="success",
            title=f"Plan upgraded to {plan.capitalize()}",
            message="Your organisation's subscription is now active.", link="/admin/billing",
        )

    async def handle_subscription_create(self, event_data: dict) -> None:
        """
        subscription.create — new subscription activated.
        Stores the subscription code so a later subscription.disable event
        can be checked against it — see handle_subscription_disable.
        """
        customer = event_data.get("customer", {})
        customer_code = customer.get("customer_code")
        plan_code = event_data.get("plan", {}).get("plan_code")
        subscription_code = event_data.get("subscription_code")
        email_token = event_data.get("email_token")
        if not customer_code:
            return
        org = (await self.db.execute(
            select(Organisation).where(
                Organisation.paystack_customer_code == customer_code
            )
        )).scalar_one_or_none()
        if not org:
            return
        for plan_name, plan_config in PLAN_FEATURES.items():
            if plan_config["plan_code"] == plan_code:
                org.plan = plan_name
                org.trial_used = True
                break
        if subscription_code:
            org.paystack_subscription_code = subscription_code
        if email_token:
            org.paystack_subscription_email_token = email_token
        await self.db.commit()


    async def handle_subscription_disable(self, event_data: dict) -> None:
        """
        subscription.disable — subscription cancelled or payment failed.
        Downgrades the organisation to free plan.

        Switching plans (e.g. pro -> agency) disables the old subscription
        while creating a new one, and Paystack doesn't guarantee delivery
        order between the two webhooks. If we have a stored subscription
        code for this org and it doesn't match the one being disabled, this
        event is for a subscription that's already been superseded — skip
        it rather than downgrading an org that just upgraded.
        """
        customer = event_data.get("customer", {})
        customer_code = customer.get("customer_code")
        subscription_code = event_data.get("subscription_code")
        if not customer_code:
            return

        result = await self.db.execute(
            select(Organisation).where(
                Organisation.paystack_customer_code == customer_code
            )
        )
        org = result.scalar_one_or_none()
        if not org:
            return

        if (
            org.paystack_subscription_code
            and subscription_code
            and org.paystack_subscription_code != subscription_code
        ):
            return  # Stale event for a subscription this org has already replaced

        org.plan = "free"
        org.paystack_subscription_code = None
        org.paystack_subscription_email_token = None
        await self.db.commit()

    # ── Plan information ──────────────────────────────────────────────────

    async def get_subscription(self, org_id: uuid.UUID) -> dict:
        """
        Return current subscription details for the org.
        Includes plan limits and Paystack customer info.
        """
        org = await self._get_org(org_id)
        effective_plan, features = get_effective_plan(org)
        now = datetime.now(timezone.utc)
        trial_active = (
            org.trial_ends_at is not None
            and org.trial_ends_at.replace(tzinfo=timezone.utc) > now
            and not org.trial_used
        )
        trial_days_remaining = (
            max(0, math.ceil((org.trial_ends_at.replace(tzinfo=timezone.utc) - now).total_seconds() / 86400))
            if trial_active
            else None
        )
        # Use the stored plan's price (not the trial plan's ₦0) so the UI
        # shows what they'll pay when they upgrade, not "Free" while on trial.
        stored_plan_config = PLAN_FEATURES.get(org.plan, PLAN_FEATURES["free"])
        amount_kobo = stored_plan_config["amount_kobo"]
        return {
            "plan": org.plan,
            "effective_plan": effective_plan,
            "plan_name": PLAN_FEATURES.get(effective_plan, PLAN_FEATURES["free"])["name"],
            "amount_kobo": amount_kobo,
            "amount_ngn": amount_kobo / 100,
            "trial_active": trial_active,
            "trial_ends_at": org.trial_ends_at.isoformat() if org.trial_ends_at else None,
            "trial_days_remaining": trial_days_remaining,
            "features": {
                k: v for k, v in features.items()
                if k not in ("name", "plan_code", "amount_kobo")
            },
            "limits": {
                "max_matters": features["max_matters"],
                "max_seats": features["max_seats"],
            },
            "paystack_customer_code": org.paystack_customer_code,
            "paystack_public_key": settings.paystack_public_key,
            "can_cancel": bool(org.paystack_subscription_code and org.paystack_subscription_email_token),
        }

    async def get_billing_history(self, org_id: uuid.UUID) -> list[dict]:
        """
        Return the org's own payment history from our BillingTransaction
        ledger — no Paystack API call or redirect needed.
        """
        result = await self.db.execute(
            select(BillingTransaction)
            .where(BillingTransaction.organisation_id == org_id)
            .order_by(BillingTransaction.paid_at.desc())
        )
        return [
            {
                "id": str(t.id),
                "reference": t.paystack_reference,
                "plan": t.plan,
                "amount_kobo": t.amount_kobo,
                "amount_ngn": t.amount_kobo / 100,
                "status": t.status,
                "paid_at": t.paid_at.isoformat(),
            }
            for t in result.scalars().all()
        ]

    async def cancel_subscription(self, org_id: uuid.UUID) -> dict:
        """
        Cancel the org's active Paystack subscription directly via the API
        and downgrade to Free — the customer never has to leave the app.
        """
        from pypaystack2 import AsyncPaystackClient

        org = await self._get_org(org_id)
        if not org.paystack_subscription_code or not org.paystack_subscription_email_token:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No active subscription to cancel.",
            )

        client = AsyncPaystackClient(secret_key=settings.paystack_secret_key)
        response = await client.subscriptions.disable(
            code=org.paystack_subscription_code,
            token=org.paystack_subscription_email_token,
        )
        if not response.status:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Paystack cancellation failed: {response.message}",
            )

        org.plan = "free"
        org.paystack_subscription_code = None
        org.paystack_subscription_email_token = None
        await self.db.commit()

        await self.notifications.fan_out_to_org_admins(
            org_id=org_id, actor_id=uuid.UUID(int=0), type="info",
            title="Subscription cancelled",
            message="Your organisation has been moved to the Free plan.", link="/admin/billing",
        )

        return {"cancelled": True, "plan": org.plan}

    # ── Feature flag admin override ───────────────────────────────────────

    async def set_feature_flags(
        self,
        org_id: uuid.UUID,
        flags: dict,
    ) -> dict:
        """
        Platform admin: override specific feature flags for an org.
        Only keys present in PLAN_FEATURES are accepted.
        Pass null to clear all overrides and revert to plan defaults.
        """
        org = await self._get_org(org_id)
        valid_keys = {
            k for k in PLAN_FEATURES["free"]
            if k not in ("name", "plan_code", "amount_kobo", "max_matters", "max_seats")
        }
        invalid = set(flags.keys()) - valid_keys
        if invalid:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid feature keys: {invalid}. Valid: {valid_keys}",
            )
        org.feature_flags = flags if flags else None
        await self.db.commit()
        _, features = get_effective_plan(org)
        return features

    # ── Plan enforcement ──────────────────────────────────────────────────

    async def check_matter_limit(self, org_id: uuid.UUID) -> None:
        """
        Raise 402 if the org has reached the matter limit for their plan.
        Called before creating a new matter.

        Locks the organisation row for the rest of the caller's transaction
        so two concurrent creates for the same org can't both pass the count
        check before either commits — see _get_org's for_update.
        """
        from sqlalchemy import func
        from app.models.matter import Matter, MatterStatus

        org = await self._get_org(org_id, for_update=True)
        # plan_config = PLANS.get(org.plan, PLANS["free"])
        _, features = get_effective_plan(org)
        max_matters = features["max_matters"]

        if max_matters is None:
            return  # Unlimited

        count_result = await self.db.execute(
            select(func.count()).select_from(Matter).where(
                Matter.organisation_id == org_id,
                Matter.status != MatterStatus.archived,
            )
        )
        count = count_result.scalar_one()

        if count >= max_matters:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail=(
                    f"Your {org.plan.title()} plan allows up to {max_matters} active matters. "
                    f"Upgrade to Pro or Agency for unlimited matters."
                ),
            )

    async def check_seat_limit(self, org_id: uuid.UUID) -> None:
        """
        Raise 402 if the org has reached the seat limit for their plan.
        Called before inviting a new member.

        Locks the organisation row for the rest of the caller's transaction
        so two concurrent invites for the same org can't both pass the count
        check before either commits — see _get_org's for_update.
        """
        from sqlalchemy import func
        from app.models.user import OrganisationMember

        org = await self._get_org(org_id, for_update=True)
        _, features = get_effective_plan(org)
        max_seats = features["max_seats"]

        if max_seats is None:
            return  # Unlimited

        count_result = await self.db.execute(
            select(func.count()).select_from(OrganisationMember).where(
                OrganisationMember.organisation_id == org_id
            )
        )
        count = count_result.scalar_one()

        if count >= max_seats:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail=(
                    f"Your {org.plan.title()} plan allows up to {max_seats} seats. "
                    f"Upgrade to Agency for unlimited seats."
                ),
            )

    async def check_feature_access(
        self,
        org_id: uuid.UUID,
        feature: Literal["drive_integration", "reports"],
    ) -> None:
        """
        Raise 402 if the org's plan doesn't include the requested feature.
        Called before Drive/Docs/Gmail API operations and report generation.
        """
        org = await self._get_org(org_id)
        _, features = get_effective_plan(org)

        if not features.get(feature):
            feature_label = feature.replace("_", " ").title()
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail=(
                    f"{feature_label} is not available on the {org.plan.title()} plan. "
                    f"Upgrade to Pro or Agency to access this feature."
                ),
            )
