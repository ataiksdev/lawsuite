# backend/app/services/local_storage_service.py
"""
Filesystem-backed logo storage for the desktop build — a single-tenant
local install has no reason to depend on an external cloud service (Supabase
Storage) for something as small as a firm logo. Mirrors
SupabaseStorageService's interface so app/api/auth.py can pick either
backend without branching on anything beyond which one is configured.

The uploaded file is saved under LOCAL_STORAGE_DIR and served back by this
same backend process via a static file mount (see app/main.py) — the
desktop app's frontend already talks to this backend on localhost, so no
separate file server is needed.
"""
import time
import uuid
from pathlib import Path

from fastapi import HTTPException, status

from app.core.config import settings


class LocalStorageService:
    def __init__(self) -> None:
        if not settings.is_local_storage_configured:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Local logo storage isn't configured (LOCAL_STORAGE_DIR unset).",
            )
        self._root = Path(settings.local_storage_dir)

    async def upload_logo(self, org_id: uuid.UUID, file_bytes: bytes, filename: str, mime_type: str) -> str:
        """
        Save (or replace) an organisation's logo on disk and return the URL
        this backend serves it back at. The file path is fixed per org
        (logos/<org_id>/logo.<ext>) so a re-upload overwrites the previous
        logo instead of accumulating orphaned files — same convention as
        SupabaseStorageService's object path.
        """
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "png"
        logo_dir = self._root / "logos" / str(org_id)
        logo_dir.mkdir(parents=True, exist_ok=True)

        # Clear any previous logo with a different extension so re-uploading
        # a .jpg over a .png doesn't leave the stale file being served.
        for existing in logo_dir.glob("logo.*"):
            existing.unlink()

        logo_path = logo_dir / f"logo.{ext}"
        logo_path.write_bytes(file_bytes)

        # Cache-bust with a version query param — the path stays constant
        # across re-uploads, so without this the frontend would keep
        # showing a cached copy of the old image.
        return f"{settings.app_url.rstrip('/')}/uploads/logos/{org_id}/logo.{ext}?v={int(time.time())}"
