# backend/app/api/billing.py
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

from app.core.config import settings
from app.core.deps import DB, AdminUser, AuthUser
from app.services.billing_service import BillingService

router = APIRouter()


class CheckoutRequest(BaseModel):
    plan: Literal["pro", "agency"]


@router.post("/checkout", response_model=dict)
async def create_checkout(
    payload: CheckoutRequest,
    current_user: AdminUser,
    db: DB,
):
    """
    Initialise a Paystack subscription checkout for the current organisation.
    Admin only.

    Returns an authorization_url — redirect the user there to complete payment.
    After payment, Paystack calls POST /webhooks/paystack and we activate the plan.

    Flow:
      1. Frontend calls POST /billing/checkout with {"plan": "pro"}
      2. Backend initialises a Paystack transaction, returns authorization_url
      3. Frontend redirects user to authorization_url
      4. User completes payment on Paystack-hosted page
      5. Paystack sends charge.success webhook → plan activated
      6. Paystack redirects user to /settings/billing?reference=xxx
    """
    from sqlalchemy import select

    from app.models.user import User

    # Fetch the admin user's email for Paystack customer creation
    user_result = await db.execute(select(User).where(User.id == current_user.user_id))
    user = user_result.scalar_one()

    service = BillingService(db)

    # Ensure Paystack customer exists for this org
    await service.get_or_create_customer(
        org_id=current_user.org_id,
        email=user.email,
        name=user.full_name,
    )

    callback_url = f"{settings.frontend_url}/settings/billing?paystack=success"

    result = await service.initialize_subscription(
        org_id=current_user.org_id,
        plan=payload.plan,
        callback_url=callback_url,
        user_email=user.email,
    )

    return result


@router.get("/subscription", response_model=dict)
async def get_subscription(current_user: AuthUser, db: DB):
    """
    Return the current plan, limits, and Paystack customer code
    for the current organisation.
    """
    service = BillingService(db)
    return await service.get_subscription(current_user.org_id)


@router.get("/portal", response_model=dict)
async def billing_portal(current_user: AdminUser, db: DB):
    """
    Return the Paystack customer portal URL for self-service
    subscription management (upgrade, downgrade, cancel).
    Admin only.
    """
    service = BillingService(db)
    return await service.manage_subscription_portal(current_user.org_id)
