# backend/app/api/auth.py
import uuid

from fastapi import APIRouter, Request, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from app.core.deps import DB, AdminUser, AuthUser
from app.schemas.auth import (
    AcceptInviteRequest,
    ChangePasswordRequest,
    InviteRequest,
    LoginRequest,
    MemberResponse,
    OrgResponse,
    RefreshRequest,
    RegisterRequest,
    RegisterResponse,
    TokenResponse,
    UpdateMemberRoleRequest,
    UpdateOrgRequest,
    UpdateProfileRequest,
    UserResponse,
)
from app.services.auth_service import AuthService

router = APIRouter()


# ─── Registration ─────────────────────────────────────────────────────────────


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, db: DB):
    """Create a new organisation and admin user. Returns tokens immediately."""
    service = AuthService(db)
    user, org, tokens = await service.register(payload)
    return RegisterResponse(
        user=UserResponse(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            role="admin",
            is_active=user.is_active,
            is_verified=user.is_verified,
            created_at=user.created_at,
        ),
        organisation=OrgResponse(
            id=org.id,
            name=org.name,
            slug=org.slug,
            plan=org.plan,
            is_active=org.is_active,
            created_at=org.created_at,
        ),
        tokens=tokens,
    )


@router.post("/login", response_model=dict)
async def login(payload: LoginRequest, db: DB):
    """Authenticate with email + password.
    If MFA is enabled: returns {mfa_required: true, mfa_token: "..."}.
    Frontend must call POST /auth/mfa/validate with the mfa_token and TOTP code.

    If MFA is not enabled: returns standard TokenResponse fields.
    """

    service = AuthService(db)
    user, org, token_or_mfa, mfa_required = await service.login(payload)

    if mfa_required:
        return {
            "mfa_required": True,
            "mfa_token": token_or_mfa,
        }

    return {
        "mfa_required": False,
        "access_token": token_or_mfa.access_token,
        "refresh_token": token_or_mfa.refresh_token,
        "token_type": "bearer",
        "expires_in": token_or_mfa.expires_in,
    }


@router.post("/refresh", response_model=TokenResponse)
async def refresh(payload: RefreshRequest, db: DB):
    """Exchange a valid refresh token for a new token pair."""
    service = AuthService(db)
    return await service.refresh(payload)


# ─── Google OAuth sign-in ─────────────────────────────────────────────────────


@router.get("/google/login")
async def google_login(request: Request):
    """
    Redirect the user to Google's OAuth consent screen.
    Use this as the href for your "Sign in with Google" button.

    On success Google redirects to /auth/google/callback.
    """
    import secrets as _secrets

    from app.services.google_signin_service import GoogleSignInService

    state = _secrets.token_urlsafe(16)
    service = GoogleSignInService(None)  # no db needed for URL generation
    url = service.get_authorization_url(state=state)
    return RedirectResponse(url=url)


@router.get("/google/callback")
async def google_callback(code: str, state: str = "", db: DB = None):
    """
    Google OAuth callback — exchanges code for user info, upserts account.

    Redirects to frontend with:
      /login?tokens=<base64-encoded-json>   — existing user, login complete
      /onboarding?provisional=<token>       — new user, needs org setup

    The frontend decodes the tokens and stores them in localStorage.
    """
    import base64
    import json

    from fastapi.responses import RedirectResponse as Redirect

    from app.services.google_signin_service import GoogleSignInService

    service = GoogleSignInService(db)
    user, org, tokens, is_new = await service.exchange_code_and_login(code, state)

    frontend = __import__("app.core.config", fromlist=["settings"]).settings.frontend_url

    if is_new:
        # New user — redirect to onboarding with provisional token
        return Redirect(url=f"{frontend}/onboarding?provisional={tokens.access_token}")

    # Existing user — encode tokens in redirect
    token_payload = base64.urlsafe_b64encode(
        json.dumps(
            {
                "access_token": tokens.access_token,
                "refresh_token": tokens.refresh_token,
                "expires_in": tokens.expires_in,
            }
        ).encode()
    ).decode()
    return Redirect(url=f"{frontend}/login?tokens={token_payload}")


class CompleteGoogleSignupRequest(BaseModel):
    provisional_token: str
    org_name: str


@router.post("/google/complete-signup", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
async def complete_google_signup(payload: CompleteGoogleSignupRequest, db: DB):
    """
    Complete org creation for new Google OAuth users.
    Called from the onboarding page after the user enters their firm name.

    Accepts the provisional_token from the /auth/google/callback redirect.
    Returns full tokens + org details on success.
    """
    from fastapi import HTTPException

    from app.core.security import decode_token

    try:
        claims = decode_token(payload.provisional_token)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid or expired provisional token")

    if claims.get("type") != "google_provisional":
        raise HTTPException(status_code=401, detail="Token is not a Google provisional token")

    user_id = uuid.UUID(claims["sub"])
    service = __import__("app.services.google_signin_service", fromlist=["GoogleSignInService"]).GoogleSignInService(db)
    user, org, tokens = await service.complete_signup(user_id, payload.org_name)

    return RegisterResponse(
        user=UserResponse(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            role="admin",
            is_active=user.is_active,
            is_verified=user.is_verified,
            created_at=user.created_at,
        ),
        organisation=OrgResponse(
            id=org.id,
            name=org.name,
            slug=org.slug,
            plan=org.plan,
            is_active=org.is_active,
            created_at=org.created_at,
        ),
        tokens=tokens,
    )


# ─── MFA ──────────────────────────────────────────────────────────────────────


class MFACodeRequest(BaseModel):
    code: str


class MFAValidateRequest(BaseModel):
    mfa_token: str
    code: str


@router.post("/mfa/setup", response_model=dict)
async def mfa_setup(current_user: AuthUser, db: DB):
    """
    Initiate MFA setup. Returns a QR code SVG and otpauth URI.
    The user scans the QR in their authenticator app, then calls /auth/mfa/verify
    with the 6-digit code to activate.
    MFA is optional — any role can enable it.
    """
    from app.services.mfa_service import MFAService

    service = MFAService(db)
    return await service.setup(current_user.user_id)


@router.post("/mfa/verify", response_model=dict)
async def mfa_verify(payload: MFACodeRequest, current_user: AuthUser, db: DB):
    """
    Verify the first TOTP code and activate MFA.
    Returns 8 single-use backup codes — show once, store securely.
    """
    from app.services.mfa_service import MFAService

    service = MFAService(db)
    return await service.verify_and_enable(current_user.user_id, payload.code)


@router.post("/mfa/validate", response_model=dict)
async def mfa_validate(payload: MFAValidateRequest, db: DB):
    """
    Step 2 of login when MFA is required.
    Submit the mfa_token from /auth/login + the 6-digit TOTP code.
    Returns full access + refresh tokens on success.
    """
    import uuid

    from app.core.config import settings as cfg
    from app.core.security import create_access_token, create_refresh_token
    from app.services.mfa_service import MFAService

    service = MFAService(db)
    claims = MFAService.decode_mfa_pending_token(payload.mfa_token)
    user_id = uuid.UUID(claims["sub"])
    org_id = uuid.UUID(claims["org_id"])
    role = claims["role"]

    await service.validate_login_code(user_id, payload.code)

    return {
        "access_token": create_access_token(str(user_id), str(org_id), role),
        "refresh_token": create_refresh_token(str(user_id), str(org_id)),
        "token_type": "bearer",
        "expires_in": cfg.access_token_expire_minutes * 60,
        "mfa_required": False,
    }


@router.post("/mfa/disable", status_code=status.HTTP_204_NO_CONTENT)
async def mfa_disable(payload: MFACodeRequest, current_user: AuthUser, db: DB):
    """
    Disable MFA. Requires current TOTP code or a backup code to confirm.
    """
    from app.services.mfa_service import MFAService

    service = MFAService(db)
    await service.disable(current_user.user_id, payload.code)


@router.post("/mfa/backup-codes/regenerate", response_model=dict)
async def mfa_regenerate_backup_codes(payload: MFACodeRequest, current_user: AuthUser, db: DB):
    """
    Regenerate backup codes. Requires current TOTP code. Old codes are invalidated.
    """
    from app.services.mfa_service import MFAService

    service = MFAService(db)
    codes = await service.regenerate_backup_codes(current_user.user_id, payload.code)
    return {
        "backup_codes": codes,
        "warning": "Previous backup codes have been invalidated.",
    }


@router.get("/mfa/status", response_model=dict)
async def mfa_status(current_user: AuthUser, db: DB):
    """Return whether MFA is enabled for the current user."""
    from sqlalchemy import select

    from app.models.user import User

    result = await db.execute(select(User).where(User.id == current_user.user_id))
    user = result.scalar_one()
    return {
        "mfa_enabled": user.mfa_enabled,
        "backup_codes_remaining": len(user.mfa_backup_codes) if user.mfa_backup_codes else 0,
    }


# ─── Current user / profile ───────────────────────────────────────────────────


@router.get("/me", response_model=UserResponse)
async def me(current_user: AuthUser, db: DB):
    """Return the currently authenticated user's profile."""
    from sqlalchemy import select

    from app.models.user import OrganisationMember, User

    result = await db.execute(select(User).where(User.id == current_user.user_id))
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
        is_verified=user.is_verified,
        created_at=user.created_at,
    )


@router.patch("/me", response_model=UserResponse)
async def update_profile(payload: UpdateProfileRequest, current_user: AuthUser, db: DB):
    """Update the current user's name or email."""
    from sqlalchemy import select

    from app.models.user import OrganisationMember

    service = AuthService(db)
    user = await service.update_profile(current_user.user_id, payload)

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
        is_verified=user.is_verified,
        created_at=user.created_at,
    )


@router.post("/me/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(payload: ChangePasswordRequest, current_user: AuthUser, db: DB):
    """Change the current user's password."""
    service = AuthService(db)
    await service.change_password(current_user.user_id, payload)


# ─── Organisation ─────────────────────────────────────────────────────────────


@router.get("/organisation", response_model=OrgResponse)
async def get_organisation(current_user: AuthUser, db: DB):
    """Get the current organisation's profile."""
    service = AuthService(db)
    org = await service.get_organisation(current_user.org_id)
    return OrgResponse(
        id=org.id,
        name=org.name,
        slug=org.slug,
        plan=org.plan,
        is_active=org.is_active,
        created_at=org.created_at,
    )


@router.patch("/organisation", response_model=OrgResponse)
async def update_organisation(payload: UpdateOrgRequest, current_user: AdminUser, db: DB):
    """Update organisation name. Admin only."""
    service = AuthService(db)
    org = await service.update_organisation(current_user.org_id, payload)
    return OrgResponse(
        id=org.id,
        name=org.name,
        slug=org.slug,
        plan=org.plan,
        is_active=org.is_active,
        created_at=org.created_at,
    )


# ─── Member management ────────────────────────────────────────────────────────


@router.get("/members", response_model=list[MemberResponse])
async def list_members(current_user: AuthUser, db: DB):
    """List all members of the current organisation."""
    service = AuthService(db)
    members = await service.list_members(current_user.org_id)
    return [MemberResponse(**m) for m in members]


@router.post("/invite", response_model=dict, status_code=status.HTTP_201_CREATED)
async def invite(payload: InviteRequest, current_user: AdminUser, db: DB):
    """Invite a new user to the organisation. Admin only."""
    service = AuthService(db)
    user, invite_url = await service.invite(
        data=payload,
        org_id=current_user.org_id,
        invited_by=current_user.user_id,
        # data=payload, org_id=current_user.org_id, invited_by=current_user.user_id,
    )
    return {
        "message": f"Invite sent to {user.email}",
        "user_id": str(user.id),
        "invite_url": invite_url,
    }
    return {"message": f"Invite sent to {user.email}", "user_id": str(user.id), "invite_url": invite_url}


@router.post("/members/{user_id}/resend-invite", response_model=dict)
async def resend_invite(user_id: uuid.UUID, current_user: AdminUser, db: DB):
    """
    Resend an invite to a pending member whose invite has expired.
    Admin only.
    """
    service = AuthService(db)
    user, invite_url = await service.resend_invite(user_id, current_user.org_id)
    return {
        "message": f"Invite resent to {user.email}",
        "invite_url": invite_url,
    }
    return {"message": f"Invite resent to {user.email}", "invite_url": invite_url}


@router.patch("/members/{user_id}/role", response_model=MemberResponse)
async def update_member_role(
    user_id: uuid.UUID,
    payload: UpdateMemberRoleRequest,
    current_user: AdminUser,
    db: DB,
):
    """Change a member's role (admin/member/viewer). Admin only. Cannot change own role."""
    # async def update_member_role(user_id: uuid.UUID, payload: UpdateMemberRoleRequest, current_user: AdminUser, db: DB):
    service = AuthService(db)
    member = await service.update_member_role(
        target_user_id=user_id,
        org_id=current_user.org_id,
        requesting_user_id=current_user.user_id,
        data=payload,
    )
    return MemberResponse(**member)


@router.delete("/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(user_id: uuid.UUID, current_user: AdminUser, db: DB):
    """
    Remove a member from the organisation. Admin only.
    If the user has no other org memberships, their account is deactivated.
    Cannot remove yourself.
    """
    service = AuthService(db)
    await service.remove_member(
        target_user_id=user_id,
        org_id=current_user.org_id,
        requesting_user_id=current_user.user_id,
    )


@router.post("/accept-invite", response_model=TokenResponse)
async def accept_invite(payload: AcceptInviteRequest, db: DB):
    """Accept an invite token, set password, and log in immediately."""
    service = AuthService(db)
    _, _, tokens = await service.accept_invite(payload)
    return tokens
