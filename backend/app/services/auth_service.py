# backend/app/services/auth_service.py
import uuid
import secrets
from datetime import datetime, timedelta, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException, status

from app.core.config import settings
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
)
from app.models.organisation import Organisation
from app.models.user import User, OrganisationMember, UserRole
from app.schemas.auth import (
    RegisterRequest,
    LoginRequest,
    TokenResponse,
    RefreshRequest,
    InviteRequest,
    AcceptInviteRequest,
)


def _make_slug(name: str) -> str:
    """Convert org name to a URL-safe slug."""
    import re
    slug = name.lower().strip()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    slug = slug.strip("-")
    return slug[:80]


def _build_tokens(user_id: uuid.UUID, org_id: uuid.UUID, role: str) -> TokenResponse:
    access_token = create_access_token(
        subject=str(user_id),
        org_id=str(org_id),
        role=role,
    )
    refresh_token = create_refresh_token(
        subject=str(user_id),
        org_id=str(org_id),
    )
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.access_token_expire_minutes * 60,
    )


class AuthService:

    def __init__(self, db: AsyncSession):
        self.db = db

    # ── Register ──────────────────────────────────────────────────────────

    async def register(self, data: RegisterRequest) -> tuple[User, Organisation, TokenResponse]:
        # Check email not already taken
        existing = await self.db.execute(
            select(User).where(User.email == data.email.lower())
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account with this email already exists",
            )

        # Generate unique slug
        base_slug = _make_slug(data.org_name)
        slug = base_slug
        counter = 1
        while True:
            taken = await self.db.execute(
                select(Organisation).where(Organisation.slug == slug)
            )
            if not taken.scalar_one_or_none():
                break
            slug = f"{base_slug}-{counter}"
            counter += 1

        # Create organisation
        org = Organisation(
            name=data.org_name.strip(),
            slug=slug,
            plan="free",
        )
        self.db.add(org)
        await self.db.flush()

        # Create admin user
        user = User(
            email=data.email.lower(),
            hashed_password=hash_password(data.password),
            full_name=data.full_name.strip(),
            is_active=True,
            is_verified=True,
        )
        self.db.add(user)
        await self.db.flush()

        # Link user to org as admin
        membership = OrganisationMember(
            organisation_id=org.id,
            user_id=user.id,
            role=UserRole.admin,
        )
        self.db.add(membership)
        await self.db.commit()
        await self.db.refresh(user)
        await self.db.refresh(org)

        tokens = _build_tokens(user.id, org.id, UserRole.admin)
        return user, org, tokens

    # ── Login ─────────────────────────────────────────────────────────────

    async def login(self, data: LoginRequest) -> tuple[User, Organisation, TokenResponse]:
        # Fetch user
        result = await self.db.execute(
            select(User).where(User.email == data.email.lower())
        )
        user = result.scalar_one_or_none()

        if not user or not user.hashed_password:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password",
            )

        if not verify_password(data.password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password",
            )

        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is deactivated",
            )

        # Fetch membership to get org + role
        mem_result = await self.db.execute(
            select(OrganisationMember)
            .where(OrganisationMember.user_id == user.id)
            .order_by(OrganisationMember.joined_at)
            .limit(1)
        )
        membership = mem_result.scalar_one_or_none()
        if not membership:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User is not a member of any organisation",
            )

        org_result = await self.db.execute(
            select(Organisation).where(Organisation.id == membership.organisation_id)
        )
        org = org_result.scalar_one_or_none()
        if not org or not org.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Organisation not found or inactive",
            )

        tokens = _build_tokens(user.id, org.id, membership.role)
        return user, org, tokens

    # ── Refresh ───────────────────────────────────────────────────────────

    async def refresh(self, data: RefreshRequest) -> TokenResponse:
        try:
            payload = decode_token(data.refresh_token)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired refresh token",
            )

        if payload.get("type") != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token is not a refresh token",
            )

        user_id = uuid.UUID(payload["sub"])
        org_id = uuid.UUID(payload["org_id"])

        # Verify user still active
        user_result = await self.db.execute(
            select(User).where(User.id == user_id)
        )
        user = user_result.scalar_one_or_none()
        if not user or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found or inactive",
            )

        # Get current role
        mem_result = await self.db.execute(
            select(OrganisationMember).where(
                OrganisationMember.user_id == user_id,
                OrganisationMember.organisation_id == org_id,
            )
        )
        membership = mem_result.scalar_one_or_none()
        if not membership:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Membership not found",
            )

        return _build_tokens(user_id, org_id, membership.role)

    # ── Invite ────────────────────────────────────────────────────────────

    async def invite(
        self,
        data: InviteRequest,
        org_id: uuid.UUID,
        invited_by: uuid.UUID,
    ) -> User:
        # Check seat limit (Phase 10 — skip for now)

        # Check if email already in org
        existing_user = await self.db.execute(
            select(User).where(User.email == data.email.lower())
        )
        user = existing_user.scalar_one_or_none()

        if user:
            # Check if already a member
            already_member = await self.db.execute(
                select(OrganisationMember).where(
                    OrganisationMember.user_id == user.id,
                    OrganisationMember.organisation_id == org_id,
                )
            )
            if already_member.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="User is already a member of this organisation",
                )

        # Create or update user with invite token
        invite_token = secrets.token_urlsafe(32)
        invite_expires = datetime.now(timezone.utc) + timedelta(days=7)

        if not user:
            user = User(
                email=data.email.lower(),
                full_name=data.full_name.strip(),
                is_active=False,
                is_verified=False,
                invite_token=invite_token,
                invite_expires_at=invite_expires,
            )
            self.db.add(user)
        else:
            user.invite_token = invite_token
            user.invite_expires_at = invite_expires

        await self.db.flush()

        # Create pending membership
        membership = OrganisationMember(
            organisation_id=org_id,
            user_id=user.id,
            role=UserRole(data.role),
        )
        self.db.add(membership)
        await self.db.commit()
        await self.db.refresh(user)

        # TODO Phase 8: send invite email via Gmail
        # For now, log the invite URL to console
        invite_url = f"{settings.frontend_url}/accept-invite?token={invite_token}"
        print(f"[INVITE] {data.email} → {invite_url}")

        return user

    # ── Accept invite ─────────────────────────────────────────────────────

    async def accept_invite(self, data: AcceptInviteRequest) -> tuple[User, Organisation, TokenResponse]:
        # Find user by token
        result = await self.db.execute(
            select(User).where(User.invite_token == data.token)
        )
        user = result.scalar_one_or_none()

        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Invalid invite token",
            )

        if user.invite_expires_at and user.invite_expires_at < datetime.now(timezone.utc):
            raise HTTPException(
                status_code=status.HTTP_410_GONE,
                detail="Invite token has expired",
            )

        # Activate the user
        user.hashed_password = hash_password(data.password)
        user.is_active = True
        user.is_verified = True
        user.invite_token = None
        user.invite_expires_at = None

        await self.db.flush()

        # Get membership + org
        mem_result = await self.db.execute(
            select(OrganisationMember)
            .where(OrganisationMember.user_id == user.id)
            .order_by(OrganisationMember.joined_at.desc())
            .limit(1)
        )
        membership = mem_result.scalar_one_or_none()
        if not membership:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No organisation membership found for this invite",
            )

        org_result = await self.db.execute(
            select(Organisation).where(Organisation.id == membership.organisation_id)
        )
        org = org_result.scalar_one()

        await self.db.commit()
        await self.db.refresh(user)

        tokens = _build_tokens(user.id, org.id, membership.role)
        return user, org, tokens

    # ── List org members ──────────────────────────────────────────────────

    async def list_members(self, org_id: uuid.UUID) -> list[dict]:
        result = await self.db.execute(
            select(User, OrganisationMember)
            .join(OrganisationMember, OrganisationMember.user_id == User.id)
            .where(OrganisationMember.organisation_id == org_id)
            .order_by(OrganisationMember.joined_at)
        )
        rows = result.all()
        return [
            {
                "id": user.id,
                "email": user.email,
                "full_name": user.full_name,
                "role": member.role,
                "is_active": user.is_active,
                "joined_at": member.joined_at,
            }
            for user, member in rows
        ]
