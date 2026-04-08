# backend/app/api/admin.py NEWER
"""
Platform-level admin routes — for the SaaS operator only.

Guard: caller must have role=admin AND org_id == PLATFORM_ADMIN_ORG_ID env var.

Endpoints:
  GET    /admin/stats
  GET    /admin/organisations
  GET    /admin/organisations/{id}
  GET    /admin/organisations/{id}/subscription
  POST   /admin/organisations/{id}/plan
  PATCH  /admin/organisations/{id}/features
  POST   /admin/organisations/{id}/deactivate
  POST   /admin/organisations/{id}/activate
"""
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from typing import Literal
from sqlalchemy import select, func

from app.core.deps import AuthUser, DB
from app.core.config import settings
from app.models.organisation import Organisation
from app.models.user import User, OrganisationMember
from app.models.matter import Matter, MatterStatus
from app.models.report import Report

router = APIRouter()


# ── Platform admin guard ──────────────────────────────────────────────────────

async def require_platform_admin(current_user: AuthUser = Depends()) -> AuthUser:
    """
    Blocks all access unless the request comes from the designated
    platform admin org. Set PLATFORM_ADMIN_ORG_ID in .env after
    registering your own account.
    """
    platform_org = settings.platform_admin_org_id
    if not platform_org:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Platform admin access is not configured",
        )
    if str(current_user.org_id) != platform_org:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Platform admin access required",
        )
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role required",
        )
    return current_user

PlatformAdmin = AuthUser  # type alias for route signatures


# ── Request schemas ───────────────────────────────────────────────────────────

class PlanOverrideRequest(BaseModel):
    plan: Literal["free", "pro", "agency"]
    reason: str | None = None

class FeatureFlagsRequest(BaseModel):
    """
    Override individual feature flags for an org.
    Pass flags={} to clear all overrides and revert to plan defaults.

    Valid boolean feature keys:
      drive_integration, reports, mfa, advanced_tasks, api_access
    """
    flags: dict[str, bool] = {}

class OrgDetailResponse(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    plan: str
    is_active: bool
    paystack_customer_code: str | None
    google_connected: bool
    member_count: int
    matter_count: int
    created_at: str

# ── Stats ─────────────────────────────────────────────────────────────────────

@router.get("/stats", response_model=dict)
async def platform_stats(
    db: DB,
    current_user: PlatformAdmin = Depends(require_platform_admin),
):
    """High-level platform metrics for the operator dashboard."""
    total_orgs = (await db.execute(
        select(func.count()).select_from(Organisation)
    )).scalar_one()

    active_orgs = (await db.execute(
        select(func.count()).select_from(Organisation)
        .where(Organisation.is_active == True)
    )).scalar_one()

    plan_counts = {}
    for plan in ("free", "pro", "agency"):
        count = (await db.execute(
            select(func.count()).select_from(Organisation)
            .where(Organisation.plan == plan, Organisation.is_active == True)
        )).scalar_one()
        plan_counts[plan] = count

    # Count orgs in active trial
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    trial_active = (await db.execute(
        select(func.count()).select_from(Organisation)
        .where(
            Organisation.trial_ends_at > now,
            Organisation.trial_used == False,
            Organisation.is_active == True,
        )
    )).scalar_one()

    total_users = (await db.execute(
        select(func.count()).select_from(User)
        .where(User.is_active == True)
    )).scalar_one()

    total_matters = (await db.execute(
        select(func.count()).select_from(Matter)
    )).scalar_one()

    google_connected = (await db.execute(
        select(func.count()).select_from(Organisation)
        .where(Organisation.google_refresh_token.isnot(None))
    )).scalar_one()

    return {
        "organisations": {
            "total": total_orgs,
            "active": active_orgs,
            "inactive": total_orgs - active_orgs,
            "in_trial": trial_active,
            "by_plan": plan_counts,
        },
        "users": {
            "total_active": total_users,
        },
        "matters": {
            "total": total_matters,
        },
        "integrations": {
            "google_connected": google_connected,
        },
    }


# ── Organisation list ─────────────────────────────────────────────────────────

@router.get("/organisations", response_model=dict)
async def list_organisations(
    db: DB,
    current_user: PlatformAdmin = Depends(require_platform_admin),
    search: str | None = Query(None),
    plan: str | None = Query(None),
    trial_active: bool | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
):
    """List all organisations with usage summary. Supports search, plan, trial filters."""
    import math
    from datetime import datetime, timezone

    query = select(Organisation)
    if search:
        query = query.where(
            Organisation.name.ilike(f"%{search}%") |
            Organisation.slug.ilike(f"%{search}%")
        )
    if plan:
        query = query.where(Organisation.plan == plan)
    if trial_active is True:
        now = datetime.now(timezone.utc)
        query = query.where(
            Organisation.trial_ends_at > now,
            Organisation.trial_used == False,
        )
    elif trial_active is False:
        now = datetime.now(timezone.utc)
        query = query.where(
            (Organisation.trial_ends_at == None) |
            (Organisation.trial_ends_at <= now) |
            (Organisation.trial_used == True)
        )

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar_one()

    query = (
        query.order_by(Organisation.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    orgs = (await db.execute(query)).scalars().all()

    now = datetime.now(timezone.utc)
    items = []
    for org in orgs:
        member_count = (await db.execute(
            select(func.count()).select_from(OrganisationMember)
            .where(OrganisationMember.organisation_id == org.id)
        )).scalar_one()

        matter_count = (await db.execute(
            select(func.count()).select_from(Matter)
            .where(
                Matter.organisation_id == org.id,
                Matter.status != MatterStatus.archived,
            )
        )).scalar_one()

        trial_on = (
            org.trial_ends_at is not None
            and org.trial_ends_at.replace(tzinfo=timezone.utc) > now
            and not org.trial_used
        )

        items.append({
            "id": str(org.id),
            "name": org.name,
            "slug": org.slug,
            "plan": org.plan,
            "is_active": org.is_active,
            "trial_active": trial_on,
            "trial_ends_at": org.trial_ends_at.isoformat() if org.trial_ends_at else None,
            "paystack_customer_code": org.paystack_customer_code,
            "google_connected": bool(org.google_refresh_token),
            "feature_flags": org.feature_flags,
            "member_count": member_count,
            "matter_count": matter_count,
            "created_at": org.created_at.isoformat(),
        })

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": math.ceil(total / page_size) if total else 0,
    }


# ── Organisation detail ───────────────────────────────────────────────────────

@router.get("/organisations/{org_id}", response_model=dict)
async def get_organisation_detail(
    org_id: uuid.UUID,
    db: DB,
    current_user: PlatformAdmin = Depends(require_platform_admin),
):
    """Full detail for a single organisation including members and usage."""
    from datetime import datetime, timezone

    org = (await db.execute(
        select(Organisation).where(Organisation.id == org_id)
    )).scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organisation not found")

    members = (await db.execute(
        select(User, OrganisationMember)
        .join(OrganisationMember, OrganisationMember.user_id == User.id)
        .where(OrganisationMember.organisation_id == org_id)
        .order_by(OrganisationMember.joined_at)
    )).all()

    matter_count = (await db.execute(
        select(func.count()).select_from(Matter)
        .where(Matter.organisation_id == org_id)
    )).scalar_one()

    report_count = (await db.execute(
        select(func.count()).select_from(Report)
        .where(Report.organisation_id == org_id)
    )).scalar_one()

    now = datetime.now(timezone.utc)
    trial_on = (
        org.trial_ends_at is not None
        and org.trial_ends_at.replace(tzinfo=timezone.utc) > now
        and not org.trial_used
    )

    return {
        "id": str(org.id),
        "name": org.name,
        "slug": org.slug,
        "plan": org.plan,
        "is_active": org.is_active,
        "trial_active": trial_on,
        "trial_ends_at": org.trial_ends_at.isoformat() if org.trial_ends_at else None,
        "trial_used": org.trial_used,
        "paystack_customer_code": org.paystack_customer_code,
        "google_connected": bool(org.google_refresh_token),
        "drive_webhook_active": bool(org.drive_webhook_channel_id),
        "drive_webhook_expires_at": (
            org.drive_webhook_expires_at.isoformat()
            if org.drive_webhook_expires_at else None
        ),
        "feature_flags": org.feature_flags,
        "created_at": org.created_at.isoformat(),
        "usage": {
            "matter_count": matter_count,
            "member_count": len(members),
            "report_count": report_count,
        },
        "members": [
            {
                "id": str(user.id),
                "email": user.email,
                "full_name": user.full_name,
                "role": member.role,
                "is_active": user.is_active,
                "mfa_enabled": user.mfa_enabled,
                "google_oauth_linked": bool(user.google_oauth_id),
                "joined_at": member.joined_at.isoformat(),
            }
            for user, member in members
        ],
    }

# ── Subscription detail ───────────────────────────────────────────────────────

@router.get("/organisations/{org_id}/subscription", response_model=dict)
async def get_org_subscription(
    org_id: uuid.UUID,
    db: DB,
    current_user: PlatformAdmin = Depends(require_platform_admin),
):
    """
    Full subscription detail for any org: effective plan, trial window,
    feature overrides, Paystack link, and plan limits.
    """
    from app.services.billing_service import BillingService
    service = BillingService(db)
    return await service.get_subscription(org_id)


# ── Plan override ─────────────────────────────────────────────────────────────

@router.post("/organisations/{org_id}/plan", response_model=dict)
async def override_plan(
    org_id: uuid.UUID,
    payload: PlanOverrideRequest,
    db: DB,
    current_user: PlatformAdmin = Depends(require_platform_admin),
):
    """
    Manually override an organisation's plan.
    Setting a paid plan also marks trial_used=True to end the trial.
    Use for comping accounts, fixing billing issues, or testing.
    """
    org = (await db.execute(
        select(Organisation).where(Organisation.id == org_id)
    )).scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organisation not found")

    old_plan = org.plan
    org.plan = payload.plan
    if payload.plan != "free":
        org.trial_used = True  # end trial when manually assigning paid plan
    await db.commit()

    return {
        "message": f"Plan updated: {old_plan} → {payload.plan}",
        "org_id": str(org_id),
        "plan": org.plan,
        "reason": payload.reason,
    }

# ── Feature flag overrides ────────────────────────────────────────────────────

@router.patch("/organisations/{org_id}/features", response_model=dict)
async def set_feature_flags(
    org_id: uuid.UUID,
    payload: FeatureFlagsRequest,
    db: DB,
    current_user: PlatformAdmin = Depends(require_platform_admin),
):
    """
    Override individual feature flags for an organisation.

    Examples:
      {"flags": {"drive_integration": true}}   — enable Drive for a free-plan org
      {"flags": {"api_access": true}}           — grant API access without upgrading
      {"flags": {}}                             — clear all overrides, revert to plan

    Flags layer on top of the plan — unspecified keys use plan defaults.
    The effective feature set is returned so you can confirm the result.
    """
    from app.services.billing_service import BillingService
    service = BillingService(db)
    effective = await service.set_feature_flags(org_id, payload.flags)
    return {
        "org_id": str(org_id),
        "feature_flags_set": payload.flags or None,
        "effective_features": effective,
    }


# ── Extend trial ──────────────────────────────────────────────────────────────

class ExtendTrialRequest(BaseModel):
    days: int


@router.post("/organisations/{org_id}/extend-trial", response_model=dict)
async def extend_trial(
    org_id: uuid.UUID,
    payload: ExtendTrialRequest,
    db: DB,
    current_user: PlatformAdmin = Depends(require_platform_admin),
):
    """
    Extend (or re-open) the trial period for an organisation.
    If the trial has already expired or been used, this resets it.
    Useful for sales conversations or support escalations.
    """
    from datetime import datetime, timezone, timedelta

    if payload.days < 1 or payload.days > 365:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="days must be between 1 and 365",
        )

    org = (await db.execute(
        select(Organisation).where(Organisation.id == org_id)
    )).scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organisation not found")

    now = datetime.now(timezone.utc)
    # If trial is still active, extend from current end date
    current_end = (
        org.trial_ends_at.replace(tzinfo=timezone.utc)
        if org.trial_ends_at else now
    )
    new_end = max(current_end, now) + timedelta(days=payload.days)

    org.trial_ends_at = new_end
    org.trial_used = False  # Re-open the trial
    await db.commit()

    return {
        "org_id": str(org_id),
        "trial_ends_at": new_end.isoformat(),
        "days_extended": payload.days,
    }

# ── Activate / Deactivate ─────────────────────────────────────────────────────

@router.post("/organisations/{org_id}/deactivate", response_model=dict)
async def deactivate_organisation(
    org_id: uuid.UUID,
    db: DB,
    current_user: PlatformAdmin = Depends(require_platform_admin),
):
    """Suspend an organisation — members can no longer log in."""
    org = (await db.execute(
        select(Organisation).where(Organisation.id == org_id)
    )).scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organisation not found")
    if not org.is_active:
        raise HTTPException(status_code=400, detail="Organisation is already inactive")

    org.is_active = False
    await db.commit()
    return {"message": f"Organisation '{org.name}' deactivated", "org_id": str(org_id)}


@router.post("/organisations/{org_id}/activate", response_model=dict)
async def activate_organisation(
    org_id: uuid.UUID,
    db: DB,
    current_user: PlatformAdmin = Depends(require_platform_admin),
):
    """Reactivate a suspended organisation."""
    org = (await db.execute(
        select(Organisation).where(Organisation.id == org_id)
    )).scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organisation not found")
    if org.is_active:
        raise HTTPException(status_code=400, detail="Organisation is already active")

    org.is_active = True
    await db.commit()
    return {"message": f"Organisation '{org.name}' reactivated", "org_id": str(org_id)}