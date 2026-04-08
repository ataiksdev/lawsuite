# backend/app/services/billing_service.py
import uuid
import hmac
import hashlib
from datetime import datetime, timezone
from typing import Literal
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException, status

from app.core.config import settings
from app.models.organisation import Organisation


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
        "amount_kobo": 1_000_000,   # ₦10,000/month
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
        "amount_kobo": 5_000_000,   # ₦50,000/month
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

class BillingService:

    def __init__(self, db: AsyncSession):
        self.db = db

    async def _get_org(self, org_id: uuid.UUID) -> Organisation:
        result = await self.db.execute(
            select(Organisation).where(Organisation.id == org_id)
        )
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

        client = AsyncPaystackClient(auth_key=settings.paystack_secret_key)
        response = await client.customers.create(
            email=email,
            full_name=name,
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

        client = AsyncPaystackClient(auth_key=settings.paystack_secret_key)
        response = await client.transactions.initialize(
            amount=plan_config["amount_kobo"],
            email=user_email,
            plan=plan_config["plan_code"],
            callback_url=callback_url,
            metadata={
                "org_id": str(org_id),
                "plan": plan,
                "cancel_action": f"{settings.frontend_url}/settings/billing",
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
        }

    # ── Webhook event handlers ────────────────────────────────────────────

    async def handle_charge_success(self, event_data: dict) -> None:
        """
        charge.success — payment completed.
        Activates the subscription plan on the organisation.
        """
        metadata = event_data.get("metadata", {})
        org_id_str = metadata.get("org_id")
        plan = metadata.get("plan")

        if not org_id_str or not plan:
            return  # Not a LegalOps subscription charge — ignore
        try:
            org_id = uuid.UUID(org_id_str)
        except ValueError:
            return

        org = await self._get_org(org_id)
        if plan in PLAN_FEATURES:
            org.plan = plan
                        # Upgrading to paid plan ends the trial
            org.trial_used=True
            await self.db.commit()

    async def handle_subscription_create(self, event_data: dict) -> None:
        """
        subscription.create — new subscription activated.
        Stores the subscription code for future management.
        """
        customer = event_data.get("customer", {})
        customer_code = customer.get("customer_code")
        plan_code = event_data.get("plan", {}).get("plan_code")
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
        await self.db.commit()


    async def handle_subscription_disable(self, event_data: dict) -> None:
        """
        subscription.disable — subscription cancelled or payment failed.
        Downgrades the organisation to free plan.
        """
        customer = event_data.get("customer", {})
        customer_code = customer.get("customer_code")
        if not customer_code:
            return

        result = await self.db.execute(
            select(Organisation).where(
                Organisation.paystack_customer_code == customer_code
            )
        )
        org = result.scalar_one_or_none()
        if org:
            org.plan = "free"
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
        return {
            "plan": org.plan,
            "effective_plan": effective_plan,
            "plan_name": PLAN_FEATURES.get(effective_plan, PLAN_FEATURES["free"])["name"],
            "amount_ngn": features["amount_kobo"] / 100,
            "trial_active": trial_active,
            "trial_ends_at": org.trial_ends_at.isoformat() if org.trial_ends_at else None,
            "features": {
                k: v for k, v in features.items()
                if k not in ("name", "plan_code", "amount_kobo")
            },
            "limits": {
                "max_matters": features["max_matters"],
                "max_seats": features["max_seats"],
            },
            "paystack_customer_code": org.paystack_customer_code,
        }

    async def manage_subscription_portal( self, org_id: uuid.UUID) -> dict:
        """
        Return the Paystack customer portal URL where the customer
        can manage or cancel their subscription.
        Paystack doesn't have a hosted portal like Stripe —
        we return a deep link to the subscription management page.
        """
        org = await self._get_org(org_id)
        if not org.paystack_customer_code:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No active Paystack subscription found.",
            )
        # Direct link to Paystack customer dashboard
        return {
            "portal_url": "https://paystack.com/account/subscriptions",
            "message": "Manage your subscription on the Paystack customer portal",
        }
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
        """
        from sqlalchemy import func
        from app.models.matter import Matter, MatterStatus

        org = await self._get_org(org_id)
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
        """
        from sqlalchemy import func
        from app.models.user import OrganisationMember

        org = await self._get_org(org_id)
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
