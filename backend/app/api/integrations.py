# backend/app/api/integrations.py
from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse

from app.core.config import settings
from app.core.deps import DB, AdminUser, AuthUser
from app.services.google_auth_service import GoogleAuthService

router = APIRouter()


@router.get("/google/connect")
async def google_connect(current_user: AdminUser, db: DB):
    """
    Initiate Google OAuth flow for this organisation.
    Admin only. Redirects to Google's consent screen.
    Returns the authorization URL (frontend handles the redirect).
    Requires drive_integration feature (available on Pro, Agency, and trial).
    """
    from app.services.billing_service import BillingService

    await BillingService(db).check_feature_access(current_user.org_id, "drive_integration")
    service = GoogleAuthService(db)
    auth_url, state = service.get_authorization_url(current_user.org_id)
    return {"authorization_url": auth_url, "state": state}


@router.get("/google/callback")
async def google_callback(
    request: Request,
    code: str,
    state: str,
    db: DB,
):
    """
    Google OAuth callback. Exchanges the code for tokens and stores them.
    Google redirects here after the user grants consent.
    Redirects to the frontend settings page on success.
    """
    service = GoogleAuthService(db)
    await service.handle_callback(code=code, state=state)

    # Redirect to frontend settings with success flag
    return RedirectResponse(url=f"{settings.frontend_url}/#/settings/integrations?google=connected")


@router.get("/google/status")
async def google_status(current_user: AuthUser, db: DB):
    """
    Return the Google integration status for the current organisation.
    Includes connected flag, granted scopes, token expiry, webhook status.
    """
    service = GoogleAuthService(db)
    return await service.get_status(current_user.org_id)


@router.delete("/google")
async def google_disconnect(current_user: AdminUser, db: DB):
    """
    Revoke Google tokens and disconnect the integration.
    Admin only. This will disable Drive, Docs, Gmail, and Calendar connectors.
    """
    service = GoogleAuthService(db)
    await service.revoke(current_user.org_id)
    return {"message": "Google Workspace disconnected"}
