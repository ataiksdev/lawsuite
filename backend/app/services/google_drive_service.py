# backend/app/services/google_drive_service.py
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException, status
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.organisation import Organisation


class GoogleDriveService:
    def __init__(self, db: AsyncSession, credentials: Credentials):
        self.db = db
        self.credentials = credentials
        self._client = None

    @property
    def client(self):
        if not self._client:
            self._client = build("drive", "v3", credentials=self.credentials)
        return self._client

    # ── Folders ───────────────────────────────────────────────────────────

    async def create_folder(
        self,
        name: str,
        parent_id: Optional[str] = None,
    ) -> dict:
        """
        Create a Drive folder. Returns {"id": ..., "webViewLink": ...}.
        If parent_id is None, folder is created in the root of Drive.
        """
        metadata = {
            "name": name,
            "mimeType": "application/vnd.google-apps.folder",
        }
        if parent_id:
            metadata["parents"] = [parent_id]

        try:
            folder = self.client.files().create(body=metadata, fields="id,name,webViewLink").execute()
            return folder
        except HttpError as e:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Drive API error creating folder: {e.reason}",
            )

    async def create_matter_folder_structure(
        self,
        client_name: str,
        matter_title: str,
        reference_no: str,
        root_folder_id: Optional[str] = None,
    ) -> tuple[str, str]:
        """
        Create the two-level folder hierarchy for a matter:
          /LegalOps/
            /Clients/
              /{client_name}/
                /{reference_no} — {matter_title}/   ← matter folder

        Returns (matter_folder_id, matter_folder_url).
        Uses root_folder_id as the base if provided (org-level root).
        """
        # Sanitise names for Drive
        safe_client = _safe_folder_name(client_name)
        safe_matter = _safe_folder_name(f"{reference_no} — {matter_title}")

        # 1. LegalOps folder under root
        legal_ops = await self._find_or_create_folder(
            name="LegalOps",
            parent_id=root_folder_id,
        )

        # 2. Clients folder under LegalOps
        clients_folder = await self._find_or_create_folder(
            name="Clients",
            parent_id=legal_ops["id"],
        )

        # 3. Client name folder under Clients
        client_folder = await self._find_or_create_folder(
            name=safe_client,
            parent_id=clients_folder["id"],
        )

        # 4. Matter folder under client folder
        matter_folder = await self.create_folder(
            name=safe_matter,
            parent_id=client_folder["id"],
        )

        return matter_folder["id"], matter_folder.get("webViewLink", "")

    async def _find_or_create_folder(self, name: str, parent_id: Optional[str]) -> dict:
        """Find an existing folder by name and parent, or create it."""
        query = f"name='{name}' " f"and mimeType='application/vnd.google-apps.folder' " f"and trashed=false"
        if parent_id:
            query += f" and '{parent_id}' in parents"

        try:
            results = self.client.files().list(q=query, fields="files(id,name,webViewLink)", pageSize=1).execute()
            files = results.get("files", [])
            if files:
                return files[0]
        except HttpError:
            pass

        return await self.create_folder(name=name, parent_id=parent_id)

    # ── Files ─────────────────────────────────────────────────────────────

    async def list_files(self, folder_id: str) -> list[dict]:
        """List files directly inside a Drive folder."""
        try:
            results = (
                self.client.files()
                .list(
                    q=f"'{folder_id}' in parents and trashed=false",
                    fields="files(id,name,mimeType,webViewLink,modifiedTime,size)",
                    orderBy="modifiedTime desc",
                    pageSize=100,
                )
                .execute()
            )
            return results.get("files", [])
        except HttpError as e:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Drive API error listing files: {e.reason}",
            )

    async def get_file_metadata(self, file_id: str) -> dict:
        """Fetch metadata for a single Drive file."""
        try:
            return (
                self.client.files()
                .get(
                    fileId=file_id,
                    fields="id,name,mimeType,webViewLink,modifiedTime,size",
                )
                .execute()
            )
        except HttpError as e:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Drive file not found: {e.reason}",
            )

    async def upload_file(
        self,
        file_bytes: bytes,
        filename: str,
        mime_type: str,
        folder_id: Optional[str] = None,
    ) -> dict:
        """
        Upload raw file bytes to Google Drive.

        Uses resumable upload for files > 5 MB, simple upload for smaller files.
        Returns {"id": ..., "name": ..., "webViewLink": ..., "mimeType": ...}.

        Args:
            file_bytes:  Raw bytes of the file to upload.
            filename:    The name the file will have in Drive.
            mime_type:   MIME type (e.g. "application/pdf", "image/jpeg").
            folder_id:   Optional Drive folder ID to place the file in.
                         If omitted the file lands in the user's root.
        """
        import io
        from googleapiclient.http import MediaIoBaseUpload

        metadata: dict = {"name": filename}
        if folder_id:
            metadata["parents"] = [folder_id]

        media = MediaIoBaseUpload(
            io.BytesIO(file_bytes),
            mimetype=mime_type,
            resumable=len(file_bytes) > 5 * 1024 * 1024,  # resumable for files > 5 MB
        )

        try:
            file = (
                self.client.files()
                .create(
                    body=metadata,
                    media_body=media,
                    fields="id,name,mimeType,webViewLink",
                )
                .execute()
            )
            return file
        except HttpError as e:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Drive upload failed: {e.reason}",
            )

    # ── Webhook channel registration ──────────────────────────────────────

    async def register_webhook_channel(self, org_id: uuid.UUID) -> dict:
        """
        Register a Drive push notification channel for this org.
        Google will POST to /webhooks/google-drive whenever any file
        in the connected Drive changes.

        Channels expire after 7 days maximum — the renewal job in
        app/workers/tasks.py handles re-registration.

        Returns the channel metadata including id and resourceId.
        """
        channel_id = f"legalops-{org_id}-{secrets.token_hex(8)}"
        expiry_ms = int((datetime.now(timezone.utc) + timedelta(days=6, hours=23)).timestamp() * 1000)

        body = {
            "id": channel_id,
            "type": "web_hook",
            "address": f"{settings.app_url}/webhooks/google-drive",
            "expiration": expiry_ms,
        }

        try:
            channel = (
                self.client.changes()
                .watch(
                    pageToken=await self._get_start_page_token(),
                    body=body,
                )
                .execute()
            )
            return channel
        except HttpError as e:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Drive webhook registration failed: {e.reason}",
            )

    async def _get_start_page_token(self) -> str:
        """Get the current changes page token — required for changes.watch()."""
        result = self.client.changes().getStartPageToken().execute()
        return result.get("startPageToken")

    async def stop_webhook_channel(self, channel_id: str, resource_id: str) -> None:
        """Stop a push notification channel before re-registering."""
        try:
            self.client.channels().stop(body={"id": channel_id, "resourceId": resource_id}).execute()
        except HttpError:
            pass  # Best-effort — channel may have already expired

    async def persist_webhook_channel(
        self,
        org_id: uuid.UUID,
        channel_id: str,
        expires_at: datetime,
    ) -> None:
        """Store the active webhook channel ID on the organisation record."""
        result = await self.db.execute(select(Organisation).where(Organisation.id == org_id))
        org = result.scalar_one_or_none()
        if org:
            org.drive_webhook_channel_id = channel_id
            org.drive_webhook_expires_at = expires_at
            await self.db.commit()


# ── Helpers ───────────────────────────────────────────────────────────────────


def _safe_folder_name(name: str) -> str:
    """Strip characters Drive doesn't allow in folder names."""
    import re

    name = re.sub(r"[/\\:*?\"<>|]", "-", name)
    return name[:255].strip()
