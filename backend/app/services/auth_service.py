# backend/app/services/auth_service.py
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.organisation import Organisation
from app.models.user import OrganisationMember, User, UserRole
from app.schemas.auth import (
    AcceptInviteRequest,
    ChangePasswordRequest,
    InviteRequest,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    UpdateMemberRoleRequest,
    UpdateOrgRequest,
    UpdateProfileRequest,
)


def _make_slug(name: str) -> str:
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
        existing = await self.db.execute(select(User).where(User.email == data.email.lower()))
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account with this email already exists",
            )

        base_slug = _make_slug(data.org_name)
        slug = base_slug
        counter = 1
        while True:
            taken = await self.db.execute(select(Organisation).where(Organisation.slug == slug))
            if not taken.scalar_one_or_none():
                break
            slug = f"{base_slug}-{counter}"
            counter += 1

        import datetime as dt
        from datetime import timezone as tz

        trial_ends = dt.datetime.now(tz.utc) + dt.timedelta(days=settings.trial_days)
        org = Organisation(
            name=data.org_name.strip(),
            slug=slug,
            plan="free",
            trial_ends_at=trial_ends,
            trial_used=False,
        )
        self.db.add(org)
        await self.db.flush()

        user = User(
            email=data.email.lower(),
            hashed_password=hash_password(data.password),
            full_name=data.full_name.strip(),
            is_active=True,
            is_verified=True,
        )
        self.db.add(user)
        await self.db.flush()

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
        result = await self.db.execute(select(User).where(User.email == data.email.lower()))
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

        org_result = await self.db.execute(select(Organisation).where(Organisation.id == membership.organisation_id))
        org = org_result.scalar_one_or_none()
        if not org or not org.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Organisation not found or inactive",
            )

        # If MFA is enabled, return a short-lived pending token instead of full access
        if user.mfa_enabled:
            from app.services.mfa_service import MFAService

            mfa_token = MFAService.create_mfa_pending_token(user.id, org.id, membership.role)
            return user, org, mfa_token, True  # mfa_required=True

        tokens = _build_tokens(user.id, org.id, membership.role)
        return user, org, tokens, False  # mfa_required=False

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

        user_result = await self.db.execute(select(User).where(User.id == user_id))
        user = user_result.scalar_one_or_none()
        if not user or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found or inactive",
            )

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
    ) -> tuple[User, str]:
        from app.services.billing_service import BillingService

        await BillingService(self.db).check_seat_limit(org_id)

        existing_user = await self.db.execute(select(User).where(User.email == data.email.lower()))
        user = existing_user.scalar_one_or_none()

        if user:
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

        membership = OrganisationMember(
            organisation_id=org_id,
            user_id=user.id,
            role=UserRole(data.role),
        )
        self.db.add(membership)
        await self.db.commit()
        await self.db.refresh(user)

        invite_url = f"{settings.frontend_url}/accept-invite?token={invite_token}"
        print(f"[INVITE] {data.email} → {invite_url}")
        return user, invite_url

    # ── Resend invite ─────────────────────────────────────────────────────

    async def resend_invite(self, user_id: uuid.UUID, org_id: uuid.UUID) -> tuple[User, str]:
        result = await self.db.execute(
            select(User, OrganisationMember)
            .join(OrganisationMember, OrganisationMember.user_id == User.id)
            .where(
                User.id == user_id,
                OrganisationMember.organisation_id == org_id,
                User.is_active == False,
            )
        )
        row = result.first()
        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Pending member not found",
            )

        user, _ = row
        invite_token = secrets.token_urlsafe(32)
        user.invite_token = invite_token
        user.invite_expires_at = datetime.now(timezone.utc) + timedelta(days=7)

        await self.db.commit()
        await self.db.refresh(user)

        invite_url = f"{settings.frontend_url}/accept-invite?token={invite_token}"
        print(f"[RESEND INVITE] {user.email} → {invite_url}")
        return user, invite_url

    # ── Accept invite ─────────────────────────────────────────────────────

    async def accept_invite(self, data: AcceptInviteRequest) -> tuple[User, Organisation, TokenResponse]:
        result = await self.db.execute(select(User).where(User.invite_token == data.token))
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

        user.hashed_password = hash_password(data.password)
        user.is_active = True
        user.is_verified = True
        user.invite_token = None
        user.invite_expires_at = None
        await self.db.flush()

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

        org_result = await self.db.execute(select(Organisation).where(Organisation.id == membership.organisation_id))
        org = org_result.scalar_one()

        await self.db.commit()
        await self.db.refresh(user)

        tokens = _build_tokens(user.id, org.id, membership.role)
        return user, org, tokens

    # ── List members ──────────────────────────────────────────────────────

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
                "is_verified": user.is_verified,
                "joined_at": member.joined_at,
                "has_pending_invite": bool(user.invite_token),
            }
            for user, member in rows
        ]

    # ── Update member role ────────────────────────────────────────────────

    async def update_member_role(
        self,
        target_user_id: uuid.UUID,
        org_id: uuid.UUID,
        requesting_user_id: uuid.UUID,
        data: UpdateMemberRoleRequest,
    ) -> dict:
        if target_user_id == requesting_user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You cannot change your own role",
            )

        result = await self.db.execute(
            select(User, OrganisationMember)
            .join(OrganisationMember, OrganisationMember.user_id == User.id)
            .where(
                User.id == target_user_id,
                OrganisationMember.organisation_id == org_id,
            )
        )
        row = result.first()
        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Member not found",
            )

        user, membership = row
        membership.role = UserRole(data.role)

        await self.db.commit()
        await self.db.refresh(membership)

        return {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "role": membership.role,
            "is_active": user.is_active,
            "is_verified": user.is_verified,
            "joined_at": membership.joined_at,
            "has_pending_invite": bool(user.invite_token),
        }

    # ── Remove member ─────────────────────────────────────────────────────

    async def remove_member(
        self,
        target_user_id: uuid.UUID,
        org_id: uuid.UUID,
        requesting_user_id: uuid.UUID,
    ) -> None:
        if target_user_id == requesting_user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You cannot remove yourself from the organisation",
            )

        result = await self.db.execute(
            select(OrganisationMember).where(
                OrganisationMember.user_id == target_user_id,
                OrganisationMember.organisation_id == org_id,
            )
        )
        membership = result.scalar_one_or_none()
        if not membership:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Member not found",
            )

        # Deactivate user if they have no other memberships
        other_orgs = await self.db.execute(
            select(OrganisationMember).where(
                OrganisationMember.user_id == target_user_id,
                OrganisationMember.organisation_id != org_id,
            )
        )
        if not other_orgs.scalars().first():
            user_result = await self.db.execute(select(User).where(User.id == target_user_id))
            user = user_result.scalar_one_or_none()
            if user:
                user.is_active = False

        await self.db.delete(membership)
        await self.db.commit()

    # ── Update member profile (self) ──────────────────────────────────────

    async def update_profile(
        self,
        user_id: uuid.UUID,
        data: UpdateProfileRequest,
    ) -> User:
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        if data.email and data.email.lower() != user.email:
            existing = await self.db.execute(select(User).where(User.email == data.email.lower()))
            if existing.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Email already in use",
                )
            user.email = data.email.lower()

        if data.full_name:
            user.full_name = data.full_name.strip()

        await self.db.commit()
        await self.db.refresh(user)
        return user

    # ── Change password (self) ────────────────────────────────────────────

    async def change_password(
        self,
        user_id: uuid.UUID,
        data: ChangePasswordRequest,
    ) -> None:
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user or not user.hashed_password:
            raise HTTPException(status_code=404, detail="User not found")

        if not verify_password(data.current_password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Current password is incorrect",
            )

        user.hashed_password = hash_password(data.new_password)
        await self.db.commit()

    # ── Update organisation ───────────────────────────────────────────────

    async def update_organisation(
        self,
        org_id: uuid.UUID,
        data: UpdateOrgRequest,
    ) -> Organisation:
        result = await self.db.execute(select(Organisation).where(Organisation.id == org_id))
        org = result.scalar_one_or_none()
        if not org:
            raise HTTPException(status_code=404, detail="Organisation not found")

        if data.name:
            org.name = data.name.strip()

        await self.db.commit()
        await self.db.refresh(org)
        return org

    # ── Get organisation ──────────────────────────────────────────────────

    async def get_organisation(self, org_id: uuid.UUID) -> Organisation:
        result = await self.db.execute(select(Organisation).where(Organisation.id == org_id))
        org = result.scalar_one_or_none()
        if not org:
            raise HTTPException(status_code=404, detail="Organisation not found")
        return org
