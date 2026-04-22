# backend/app/services/google_auth_service.py
import json
import os
import uuid
from datetime import datetime, timedelta, timezone

# Allow scope changes (Google often adds 'profile' or normalizes scopes)
os.environ["OAUTHLIB_RELAX_TOKEN_SCOPE"] = "1"

from fastapi import HTTPException, status
from google.auth.exceptions import RefreshError
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import decrypt, encrypt
from app.models.organisation import Organisation

# Scopes required across all Google connectors
GOOGLE_SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/drive.activity.readonly",
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/calendar.events",
]


def _build_flow() -> Flow:
    client_config = {
        "web": {
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "redirect_uris": [settings.google_redirect_uri],
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }
    }
    flow = Flow.from_client_config(
        client_config,
        scopes=GOOGLE_SCOPES,
        redirect_uri=settings.google_redirect_uri,
    )
    return flow


class GoogleAuthService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _get_org(self, org_id: uuid.UUID) -> Organisation:
        result = await self.db.execute(select(Organisation).where(Organisation.id == org_id))
        org = result.scalar_one_or_none()
        if not org:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Organisation not found",
            )
        return org

    # ── OAuth flow ────────────────────────────────────────────────────────

    def get_authorization_url(self, org_id: uuid.UUID) -> tuple[str, str]:
        """
        Build the Google OAuth consent URL manually to avoid automatic PKCE
        generation by the Flow object, which is difficult to manage in a stateless API.
        Returns (authorization_url, state).
        """
        import urllib.parse

        params = {
            "client_id": settings.google_client_id,
            "redirect_uri": settings.google_redirect_uri,
            "response_type": "code",
            "scope": " ".join(GOOGLE_SCOPES),
            "access_type": "offline",
            "include_granted_scopes": "true",
            "prompt": "consent",  # always ask for refresh token
            "state": str(org_id),
        }

        base_url = "https://accounts.google.com/o/oauth2/auth"
        auth_url = f"{base_url}?{urllib.parse.urlencode(params)}"

        return auth_url, str(org_id)

    async def handle_callback(
        self,
        code: str,
        state: str,
        url: str | None = None,
    ) -> Organisation:
        """
        Exchange the auth code for tokens and store them encrypted on the org.
        `state` is the org_id encoded during get_authorization_url().
        """
        try:
            org_id = uuid.UUID(state)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid state parameter",
            )

        flow = _build_flow()
        try:
            if url:
                # Use the full URL to handle Google's latest security parameters (like 'iss')
                flow.state = state
                flow.fetch_token(authorization_response=url)
            else:
                flow.fetch_token(code=code)
        except Exception as e:
            # Convert exchange errors to 400 instead of 500
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to exchange Google tokens: {str(e)}",
            )

        credentials = flow.credentials
        org = await self._get_org(org_id)

        # Ensure expiry is timezone-aware for SQLAlchemy DateTime(timezone=True)
        if credentials.expiry and credentials.expiry.tzinfo is None:
            credentials.expiry = credentials.expiry.replace(tzinfo=timezone.utc)

        await self._store_tokens(org, credentials)
        await self.db.commit()
        await self.db.refresh(org)
        return org

    async def _store_tokens(self, org: Organisation, credentials: Credentials) -> None:
        """Encrypt and persist Google tokens on the organisation record."""
        org.google_access_token = encrypt(credentials.token)
        org.google_refresh_token = (
            encrypt(credentials.refresh_token) if credentials.refresh_token else org.google_refresh_token
        )
        org.google_token_expiry = credentials.expiry
        org.google_scopes = json.dumps(list(credentials.scopes or GOOGLE_SCOPES))

    # ── Token retrieval ───────────────────────────────────────────────────

    async def get_valid_credentials(self, org_id: uuid.UUID) -> Credentials:
        """
        Return valid Google credentials for an org.
        Auto-refreshes the access token if expired.
        Raises 400 if Google is not connected.
        """
        org = await self._get_org(org_id)

        if not org.google_access_token or not org.google_refresh_token:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Google Workspace is not connected for this organisation",
            )

        credentials = Credentials(
            token=decrypt(org.google_access_token),
            refresh_token=decrypt(org.google_refresh_token),
            token_uri="https://oauth2.googleapis.com/token",
            client_id=settings.google_client_id,
            client_secret=settings.google_client_secret,
            scopes=json.loads(org.google_scopes) if org.google_scopes else GOOGLE_SCOPES,
        )

        # Refresh if expired or expiring within 5 minutes
        if org.google_token_expiry:
            expiry_aware = org.google_token_expiry
            if expiry_aware.tzinfo is None:
                expiry_aware = expiry_aware.replace(tzinfo=timezone.utc)
            if expiry_aware <= datetime.now(timezone.utc) + timedelta(minutes=5):
                try:
                    credentials.refresh(Request())
                    await self._store_tokens(org, credentials)
                    await self.db.commit()
                except RefreshError:
                    # Token was revoked or is otherwise invalid. Clear it locally.
                    org.google_access_token = None
                    org.google_refresh_token = None
                    org.google_token_expiry = None
                    org.google_scopes = None
                    await self.db.commit()
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Google Workspace connection has expired or been revoked. Please reconnect.",
                    )

        return credentials

    # ── Status + revoke ───────────────────────────────────────────────────

    async def get_status(self, org_id: uuid.UUID) -> dict:
        org = await self._get_org(org_id)
        connected = bool(org.google_access_token and org.google_refresh_token)
        return {
            "connected": connected,
            "scopes": json.loads(org.google_scopes) if org.google_scopes else [],
            "token_expiry": org.google_token_expiry.isoformat() if org.google_token_expiry else None,
            "webhook_active": bool(org.drive_webhook_channel_id),
            "webhook_expires_at": (org.drive_webhook_expires_at.isoformat() if org.drive_webhook_expires_at else None),
        }

    async def revoke(self, org_id: uuid.UUID) -> None:
        """
        Revoke Google tokens and clear all integration fields from the org.
        Also clears the Drive webhook channel ID.
        """
        import httpx

        org = await self._get_org(org_id)

        if org.google_access_token:
            try:
                async with httpx.AsyncClient() as http:
                    await http.post(
                        "https://oauth2.googleapis.com/revoke",
                        params={"token": decrypt(org.google_access_token)},
                    )
            except Exception:
                pass  # Revocation best-effort — clear locally regardless

        org.google_access_token = None
        org.google_refresh_token = None
        org.google_token_expiry = None
        org.google_scopes = None
        org.drive_webhook_channel_id = None
        org.drive_webhook_expires_at = None

        await self.db.commit()
