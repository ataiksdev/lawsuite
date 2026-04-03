# backend/app/api/auth.py
from fastapi import APIRouter, status
from app.core.deps import AuthUser, AdminUser, DB
from app.services.auth_service import AuthService
from sqlalchemy import select
from app.models.user import User, OrganisationMember
from app.models.organisation import Organisation

from app.schemas.auth import (
    RegisterRequest,
    RegisterResponse,
    LoginRequest,
    TokenResponse,
    RefreshRequest,
    InviteRequest,
    AcceptInviteRequest,
    UserResponse,
    OrgResponse,
)

router = APIRouter()


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, db: DB):
    """
    Create a new organisation and admin user in one step.
    Returns tokens immediately — no email verification required for now.
    """
    service = AuthService(db)
    user, org, tokens = await service.register(payload)
    return RegisterResponse(
        user=UserResponse(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            role="admin",
            is_active=user.is_active,
            created_at=user.created_at,
        ),
        organisation=OrgResponse(
            id=org.id,
            name=org.name,
            slug=org.slug,
            plan=org.plan,
            created_at=org.created_at,
        ),
        tokens=tokens,
    )


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, db: DB):
    """
    Authenticate with email + password.
    Returns access token (30 min) and refresh token (30 days).
    """
    service = AuthService(db)
    _, _, tokens = await service.login(payload)
    return tokens


@router.post("/refresh", response_model=TokenResponse)
async def refresh(payload: RefreshRequest, db: DB):
    """
    Exchange a valid refresh token for a new access + refresh token pair.
    Old refresh token is implicitly invalidated by expiry rotation.
    """
    service = AuthService(db)
    return await service.refresh(payload)


@router.get("/me", response_model=UserResponse)
async def me(current_user: AuthUser, db: DB):
    """Return the currently authenticated user's profile."""

    result = await db.execute(
        select(User).where(User.id == current_user.user_id)
    )
    user = result.scalar_one()

    mem_result = await db.execute(
        select(OrganisationMember).where(
            OrganisationMember.user_id == current_user.user_id,
            OrganisationMember.organisation_id == current_user.org_id,
        )
    )
    membership = mem_result.scalar_one()

    return UserResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=membership.role,
        is_active=user.is_active,
        created_at=user.created_at,
    )


@router.post("/invite", response_model=dict, status_code=status.HTTP_201_CREATED)
async def invite(payload: InviteRequest, current_user: AdminUser, db: DB):
    """
    Invite a new user to the organisation by email.
    Admin only. Generates an invite token and logs the invite URL.
    """
    service = AuthService(db)
    user = await service.invite(
        data=payload,
        org_id=current_user.org_id,
        invited_by=current_user.user_id,
    )
    return {
        "message": f"Invite sent to {user.email}",
        "user_id": str(user.id),
    }


@router.post("/accept-invite", response_model=TokenResponse)
async def accept_invite(payload: AcceptInviteRequest, db: DB):
    """
    Accept an invite token and set a password.
    Activates the user and returns tokens so they are logged in immediately.
    """
    service = AuthService(db)
    _, _, tokens = await service.accept_invite(payload)
    return tokens


@router.get("/members", response_model=list[UserResponse])
async def list_members(current_user: AuthUser, db: DB):
    """List all members in the current organisation."""
    service = AuthService(db)
    members = await service.list_members(current_user.org_id)
    return [
        UserResponse(
            id=m["id"],
            email=m["email"],
            full_name=m["full_name"],
            role=m["role"],
            is_active=m["is_active"],
            created_at=m["joined_at"],
        )
        for m in members
    ]