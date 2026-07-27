# backend/app/services/supabase_storage_service.py
"""
Thin async wrapper around the Supabase Storage REST API (plain httpx calls —
no supabase-py dependency, matching this backend's existing lightweight
integration style for Paystack/Google/Resend).

Used for organisation logo uploads only. Independent of the app's primary
Postgres connection (DATABASE_URL) — this only needs a Supabase project's
Storage API to be reachable, regardless of where the main DB is hosted.
"""
import time
import uuid

import httpx
from fastapi import HTTPException, status

from app.core.config import settings


class SupabaseStorageService:
    def __init__(self) -> None:
        if not settings.is_supabase_storage_configured:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Logo storage isn't configured yet — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
            )
        self._base_url = settings.supabase_url.rstrip("/")
        self._bucket = settings.supabase_logos_bucket
        self._headers = {
            "Authorization": f"Bearer {settings.supabase_service_role_key}",
            "apikey": settings.supabase_service_role_key,
        }

    async def upload_logo(self, org_id: uuid.UUID, file_bytes: bytes, filename: str, mime_type: str) -> str:
        """
        Upload (or replace) an organisation's logo and return its public URL.
        The object path is fixed per org (<org_id>/logo.<ext>) so a
        re-upload overwrites the previous logo via upsert instead of
        accumulating orphaned files.
        """
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "png"
        object_path = f"{org_id}/logo.{ext}"

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{self._base_url}/storage/v1/object/{self._bucket}/{object_path}",
                headers={
                    **self._headers,
                    "Content-Type": mime_type,
                    "x-upsert": "true",
                },
                content=file_bytes,
            )

        if response.status_code not in (200, 201):
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Failed to upload logo to storage: {response.text}",
            )

        # Cache-bust with a version query param — the object path (and
        # therefore its URL) stays constant across re-uploads via upsert,
        # so without this, browsers/CDNs would keep serving the old image.
        return f"{self._base_url}/storage/v1/object/public/{self._bucket}/{object_path}?v={int(time.time())}"
