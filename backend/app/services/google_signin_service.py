# backend/app/services/google_signin_service.py
"""
Google OAuth for user identity (Sign in with Google).

This is SEPARATE from google_auth_service.py which handles per-org
Google Workspace access (Drive, Docs, Gmail).

This service:
  - Generates the Google OAuth consent URL for identity sign-in
  - Exchanges the code for an ID token
  - Verifies the ID token with Google
  - Creates or links a user account (no password needed)
  - Returns a JWT pair exactly like the email/password login

Scopes: openid, email, profile only (not Drive/Gmail — that's separate)

Flow:
  1. Frontend: GET /auth/google/login  → redirects to Google consent
  2. Google: redirects to /auth/google/callback?code=xxx&state=yyy
  3. Backend: exchanges code → verifies ID token → upserts user → returns tokens
"""

import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import create_access_token, create_refresh_token
from app.models.organisation import Organisation
from app.models.user import OrganisationMember, User, UserRole
from app.schemas.auth import TokenResponse

GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"
SCOPES = ["openid", "email", "profile"]


class GoogleSignInService:
    def __init__(self, db: AsyncSession):
        self.db = db

    def get_authorization_url(self, state: str) -> str:
        """
        Build the Google OAuth2 consent URL.
        State encodes the frontend redirect URL (base64) for CSRF protection.
        """
        from authlib.integrations.httpx_client import AsyncOAuth2Client

        client = AsyncOAuth2Client(
            client_id=settings.google_client_id,
            client_secret=settings.google_client_secret,
            redirect_uri=settings.google_signin_redirect_uri,
            scope=" ".join(SCOPES),
        )
        url, _ = client.create_authorization_url(
            "https://accounts.google.com/o/oauth2/v2/auth",
            state=state,
            access_type="online",  # identity only — no refresh token needed
            prompt="select_account",
        )
        return url

    async def exchange_code_and_login(self, code: str, state: str) -> tuple[User, Organisation, TokenResponse, bool]:
        """
        Exchange the authorization code for user info, then upsert the user.

        Returns (user, org, tokens, is_new_user).
        is_new_user=True means the frontend should show org setup.

        Account linking rules:
          - If google_oauth_id matches an existing user → log them in
          - If email matches an existing user with no google_oauth_id → link accounts
          - If email matches a user who already has a DIFFERENT google_oauth_id → reject
          - Otherwise → create a new user (no org yet — frontend handles org creation)
        """
        user_info = await self._fetch_user_info(code)
        google_id = user_info["sub"]
        email = user_info["email"].lower()
        full_name = user_info.get("name", email.split("@")[0])
        avatar_url = user_info.get("picture")

        # 1. Look up by google_oauth_id first
        existing_by_google = (
            await self.db.execute(select(User).where(User.google_oauth_id == google_id))
        ).scalar_one_or_none()

        if existing_by_google:
            user = existing_by_google
            user.google_avatar_url = avatar_url
            is_new = False

        else:
            # 2. Look up by email
            existing_by_email = (await self.db.execute(select(User).where(User.email == email))).scalar_one_or_none()

            if existing_by_email:
                if existing_by_email.google_oauth_id and existing_by_email.google_oauth_id != google_id:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="This email is linked to a different Google account.",
                    )
                # Link Google identity to existing password account
                existing_by_email.google_oauth_id = google_id
                existing_by_email.google_oauth_email = email
                existing_by_email.google_avatar_url = avatar_url
                existing_by_email.is_verified = True
                user = existing_by_email
                is_new = False

            else:
                # 3. Create new user — no org yet
                user = User(
                    email=email,
                    full_name=full_name,
                    google_oauth_id=google_id,
                    google_oauth_email=email,
                    google_avatar_url=avatar_url,
                    is_active=True,
                    is_verified=True,
                    hashed_password=None,  # OAuth users have no password
                )
                self.db.add(user)
                is_new = True

        await self.db.flush()

        # Get org membership if user already has one
        membership = (
            await self.db.execute(
                select(OrganisationMember)
                .where(OrganisationMember.user_id == user.id)
                .order_by(OrganisationMember.joined_at)
                .limit(1)
            )
        ).scalar_one_or_none()

        if not membership and not is_new:
            # Existing user has no org — treat as new for onboarding
            is_new = True

        if membership:
            org = (
                await self.db.execute(select(Organisation).where(Organisation.id == membership.organisation_id))
            ).scalar_one()
            role = membership.role
        else:
            # New user — no org yet. Return a provisional token with no org_id.
            # Frontend will POST /auth/google/complete-signup to create the org.
            await self.db.commit()
            provisional_token = TokenResponse(
                access_token=_create_provisional_token(user.id),
                refresh_token="",
                expires_in=600,  # 10 minutes to complete setup
            )
            return user, None, provisional_token, True

        if not org.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your organisation account is inactive.",
            )

        await self.db.commit()
        await self.db.refresh(user)

        tokens = TokenResponse(
            access_token=create_access_token(
                subject=str(user.id),
                org_id=str(org.id),
                role=role,
            ),
            refresh_token=create_refresh_token(
                subject=str(user.id),
                org_id=str(org.id),
            ),
            expires_in=settings.access_token_expire_minutes * 60,
        )
        return user, org, tokens, is_new

    async def complete_signup(self, user_id: uuid.UUID, org_name: str) -> tuple[User, Organisation, TokenResponse]:
        """
        Called after OAuth sign-in when a new Google user needs to create their org.
        Validates the provisional token server-side (token type check done in route).
        """

        user = (await self.db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()

        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        # Verify user doesn't already have an org
        existing_mem = (
            await self.db.execute(select(OrganisationMember).where(OrganisationMember.user_id == user_id))
        ).scalar_one_or_none()
        if existing_mem:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="User already has an organisation.",
            )

        # Create org with 30-day trial
        import datetime as dt
        from datetime import timezone as tz

        from app.services.auth_service import _make_slug

        base_slug = _make_slug(org_name)
        slug = base_slug
        counter = 1
        while True:
            taken = (await self.db.execute(select(Organisation).where(Organisation.slug == slug))).scalar_one_or_none()
            if not taken:
                break
            slug = f"{base_slug}-{counter}"
            counter += 1

        trial_ends = dt.datetime.now(tz.utc) + dt.timedelta(days=settings.trial_days)

        org = Organisation(
            name=org_name.strip(),
            slug=slug,
            plan="free",
            trial_ends_at=trial_ends,
            trial_used=False,
        )
        self.db.add(org)
        await self.db.flush()

        membership = OrganisationMember(
            organisation_id=org.id,
            user_id=user.id,
            role=UserRole.admin,
        )
        self.db.add(membership)
        await self.db.commit()
        await self.db.refresh(org)
        await self.db.refresh(user)

        tokens = TokenResponse(
            access_token=create_access_token(
                subject=str(user.id),
                org_id=str(org.id),
                role=UserRole.admin,
            ),
            refresh_token=create_refresh_token(
                subject=str(user.id),
                org_id=str(org.id),
            ),
            expires_in=settings.access_token_expire_minutes * 60,
        )
        return user, org, tokens

    async def _fetch_user_info(self, code: str) -> dict:
        """Exchange authorization code for user info via Google's userinfo endpoint."""
        import httpx

        try:
            async with httpx.AsyncClient() as client:
                # Exchange code for tokens
                token_resp = await client.post(
                    "https://oauth2.googleapis.com/token",
                    data={
                        "code": code,
                        "client_id": settings.google_client_id,
                        "client_secret": settings.google_client_secret,
                        "redirect_uri": settings.google_signin_redirect_uri,
                        "grant_type": "authorization_code",
                    },
                )
                token_resp.raise_for_status()
                access_token = token_resp.json()["access_token"]

                # Fetch user profile
                info_resp = await client.get(
                    GOOGLE_USERINFO_URL,
                    headers={"Authorization": f"Bearer {access_token}"},
                )
                info_resp.raise_for_status()
                user_info = info_resp.json()

            if not user_info.get("email_verified"):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Google account email is not verified.",
                )
            return user_info

        except httpx.HTTPStatusError as e:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Google OAuth error: {e.response.status_code}",
            )


def _create_provisional_token(user_id: uuid.UUID) -> str:
    """
    Short-lived token for new Google OAuth users who haven't created an org yet.
    Type 'google_provisional' — only accepted by /auth/google/complete-signup.
    """
    from datetime import timedelta

    from jose import jwt

    expire = __import__("datetime").datetime.now(__import__("datetime").timezone.utc) + timedelta(minutes=10)
    return jwt.encode(
        {
            "sub": str(user_id),
            "type": "google_provisional",
            "exp": expire,
        },
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )
