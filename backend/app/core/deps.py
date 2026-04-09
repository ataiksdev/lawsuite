# backend/app/core/deps.py
import uuid
from typing import Annotated

from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from google.oauth2.credentials import Credentials
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_token

security = HTTPBearer()


class CurrentUser:
    def __init__(self, user_id: uuid.UUID, org_id: uuid.UUID, role: str):
        self.user_id = user_id
        self.org_id = org_id
        self.role = role

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"

    @property
    def is_member(self) -> bool:
        return self.role in ("admin", "member")


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(security),
) -> CurrentUser:
    try:
        payload = decode_token(credentials.credentials)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token is not an access token",
        )

    user_id = payload.get("sub")
    org_id = payload.get("org_id")
    role = payload.get("role", "member")

    if not user_id or not org_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing required claims",
        )

    return CurrentUser(
        user_id=uuid.UUID(user_id),
        org_id=uuid.UUID(org_id),
        role=role,
    )


def require_admin(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user


async def get_google_credentials(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Credentials:
    """
    Dependency that returns valid Google credentials for the current org.
    Raises 400 if Google Workspace is not connected.
    Auto-refreshes the access token if it is expired.
    Used by Drive, Docs, Gmail, and Calendar connectors.
    """
    from app.services.google_auth_service import GoogleAuthService

    service = GoogleAuthService(db)
    return await service.get_valid_credentials(current_user.org_id)


# ─── Annotated shorthands for route signatures ────────────────────────────────

AuthUser = Annotated[CurrentUser, Depends(get_current_user)]
AdminUser = Annotated[CurrentUser, Depends(require_admin)]
DB = Annotated[AsyncSession, Depends(get_db)]
GoogleCreds = Annotated[Credentials, Depends(get_google_credentials)]
