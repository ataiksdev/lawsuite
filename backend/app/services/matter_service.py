# backend/app/services/matter_service.py
import re
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.client import Client
from app.models.matter import Matter, MatterStatus
from app.models.matter_document import DocumentType, MatterDocument, MatterDocumentVersion
from app.models.organisation import Organisation
from app.schemas.matter import MatterCreate, MatterUpdate, StatusUpdate
from app.services.activity_service import ActivityService
from app.services.notification_service import NotificationService

# Valid stage transitions — prevents arbitrary jumps
ALLOWED_TRANSITIONS: dict[MatterStatus, list[MatterStatus]] = {
    MatterStatus.intake:    [MatterStatus.open, MatterStatus.archived],
    MatterStatus.open:      [MatterStatus.pending, MatterStatus.in_review, MatterStatus.closed, MatterStatus.archived],
    MatterStatus.pending:   [MatterStatus.open, MatterStatus.in_review, MatterStatus.closed, MatterStatus.archived],
    MatterStatus.in_review: [MatterStatus.open, MatterStatus.pending, MatterStatus.closed, MatterStatus.archived],
    MatterStatus.closed:    [MatterStatus.open, MatterStatus.archived],
    MatterStatus.archived:  [MatterStatus.open],
}

# Regex for a bare Drive ID — alphanumerics, hyphens, underscores, 10+ chars
_BARE_ID_RE = re.compile(r'^[A-Za-z0-9_-]{10,}$')
_FOLDERS_RE  = re.compile(r'/folders/([A-Za-z0-9_-]+)')
_QUERY_ID_RE = re.compile(r'[?&]id=([A-Za-z0-9_-]+)')


async def _generate_reference(db: AsyncSession, org_id: uuid.UUID) -> str:
    year = datetime.now(timezone.utc).year
    count_result = await db.execute(
        select(func.count())
        .select_from(Matter)
        .where(
            Matter.organisation_id == org_id,
            Matter.reference_no.like(f"MAT-{year}-%"),
        )
    )
    count = count_result.scalar_one()
    return f"MAT-{year}-{str(count + 1).zfill(4)}"


class MatterService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.activity = ActivityService(db)
        self.notifications = NotificationService(db)

    # ── Helpers ───────────────────────────────────────────────────────────

    async def _get_matter(self, matter_id: uuid.UUID, org_id: uuid.UUID) -> Matter:
        result = await self.db.execute(
            select(Matter)
            .options(selectinload(Matter.client))
            .where(
                Matter.id == matter_id,
                Matter.organisation_id == org_id,
            )
        )
        matter = result.scalar_one_or_none()
        if not matter:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Matter not found")
        return matter

    async def _verify_client(self, client_id: uuid.UUID, org_id: uuid.UUID) -> None:
        result = await self.db.execute(
            select(Client).where(
                Client.id == client_id,
                Client.organisation_id == org_id,
                Client.is_active == True,
            )
        )
        if not result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Client not found or inactive",
            )

    # ── CRUD ──────────────────────────────────────────────────────────────

    async def list_matters(
        self,
        org_id: uuid.UUID,
        status_filter: MatterStatus | None = None,
        client_id: uuid.UUID | None = None,
        assigned_to: uuid.UUID | None = None,
        search: str | None = None,
        page: int = 1,
        page_size: int = 25,
    ) -> tuple[list[Matter], int]:
        query = select(Matter).options(selectinload(Matter.client)).where(Matter.organisation_id == org_id)

        if status_filter:
            query = query.where(Matter.status == status_filter)
        if client_id:
            query = query.where(Matter.client_id == client_id)
        if assigned_to:
            query = query.where(Matter.assigned_to == assigned_to)
        if search:
            query = query.where(Matter.title.ilike(f"%{search}%") | Matter.reference_no.ilike(f"%{search}%"))

        count_q = select(func.count()).select_from(query.subquery())
        total = (await self.db.execute(count_q)).scalar_one()

        query = query.order_by(Matter.updated_at.desc()).offset((page - 1) * page_size).limit(page_size)
        result = await self.db.execute(query)
        return list(result.scalars().all()), total

    async def get_matter(self, matter_id: uuid.UUID, org_id: uuid.UUID) -> Matter:
        return await self._get_matter(matter_id, org_id)

    async def create_matter(
        self,
        org_id: uuid.UUID,
        user_id: uuid.UUID,
        data: MatterCreate,
    ) -> Matter:
        from app.services.billing_service import BillingService

        await BillingService(self.db).check_matter_limit(org_id)
        await self._verify_client(data.client_id, org_id)

        reference_no = await _generate_reference(self.db, org_id)

        matter = Matter(
            organisation_id=org_id,
            client_id=data.client_id,
            assigned_to=data.assigned_to,
            title=data.title.strip(),
            reference_no=reference_no,
            matter_type=data.matter_type,
            status=MatterStatus.intake,
            description=data.description,
            target_close_at=data.target_close_at,
        )
        self.db.add(matter)
        await self.db.flush()

        await self.activity.log(
            matter_id=matter.id,
            org_id=org_id,
            actor_id=user_id,
            event_type="matter_created",
            payload={
                "title": matter.title,
                "type": matter.matter_type,
                "reference_no": matter.reference_no,
            },
        )

        # Notify the assigned lawyer if someone else created the matter
        if matter.assigned_to and matter.assigned_to != user_id:
            await self.notifications.create(
                user_id=matter.assigned_to,
                org_id=org_id,
                type="info",
                title=f'Matter assigned to you: "{matter.title}"',
                message="A new matter has been assigned to you.",
                link=f"/matters/{matter.id}",
            )

        await self.db.commit()
        await self.db.refresh(matter)
        return await self._get_matter(matter.id, org_id)

    async def update_matter(
        self,
        matter_id: uuid.UUID,
        org_id: uuid.UUID,
        user_id: uuid.UUID,
        data: MatterUpdate,
    ) -> Matter:
        matter = await self._get_matter(matter_id, org_id)

        if data.client_id is not None:
            await self._verify_client(data.client_id, org_id)

        update_data = data.model_dump(exclude_unset=True)
        changed: dict = {}

        for field, value in update_data.items():
            old = getattr(matter, field)
            if old != value:
                changed[field] = {"from": str(old) if old else None, "to": str(value) if value else None}
                setattr(matter, field, value)

        if changed:
            await self.activity.log(
                matter_id=matter_id,
                org_id=org_id,
                actor_id=user_id,
                event_type="matter_updated",
                payload={"changes": changed},
            )

            # Notify new assignee if assigned_to changed
            new_assignee = update_data.get("assigned_to")
            if new_assignee and new_assignee != matter.assigned_to and new_assignee != user_id:
                await self.notifications.create(
                    user_id=new_assignee,
                    org_id=org_id,
                    type="info",
                    title=f'Matter assigned to you: "{matter.title}"',
                    message="A matter has been assigned to you.",
                    link=f"/matters/{matter_id}",
                )

        await self.db.commit()
        return await self._get_matter(matter_id, org_id)

    async def change_status(
        self,
        matter_id: uuid.UUID,
        org_id: uuid.UUID,
        user_id: uuid.UUID,
        data: StatusUpdate,
    ) -> Matter:
        matter = await self._get_matter(matter_id, org_id)
        old_status = matter.status
        new_status = data.status

        if old_status == new_status:
            return matter

        allowed = ALLOWED_TRANSITIONS.get(old_status, [])
        if new_status not in allowed:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Cannot transition from '{old_status}' to '{new_status}'",
            )

        matter.status = new_status

        if new_status == MatterStatus.closed:
            matter.closed_at = datetime.now(timezone.utc)
        elif old_status == MatterStatus.closed:
            matter.closed_at = None

        await self.activity.log(
            matter_id=matter_id,
            org_id=org_id,
            actor_id=user_id,
            event_type="status_changed",
            payload={
                "from": old_status,
                "to": new_status,
                "reason": data.reason,
            },
        )

        # Notify the assigned lawyer about the status change
        if matter.assigned_to and matter.assigned_to != user_id:
            await self.notifications.create(
                user_id=matter.assigned_to,
                org_id=org_id,
                type="info",
                title=f'Matter status updated: "{matter.title}"',
                message=f"Status changed from {old_status} to {new_status}.",
                link=f"/matters/{matter_id}",
            )

        await self.db.commit()
        return await self._get_matter(matter_id, org_id)

    async def delete_matter(
        self,
        matter_id: uuid.UUID,
        org_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> None:
        matter = await self._get_matter(matter_id, org_id)
        if matter.status not in (MatterStatus.archived,):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Only archived matters can be deleted. Archive the matter first.",
            )
        await self.db.delete(matter)
        await self.db.commit()

    # ── Drive folder linking ───────────────────────────────────────────────────

    @staticmethod
    def _extract_folder_id(folder_id_or_url: str) -> str:
        """
        Accept either a raw Drive folder ID or any common shareable URL form:
          https://drive.google.com/drive/folders/{id}
          https://drive.google.com/drive/u/0/folders/{id}
          https://drive.google.com/open?id={id}
          https://drive.google.com/folderview?id={id}
        Returns the bare folder ID string.
        """
        s = folder_id_or_url.strip()
        # Already a bare ID — only alphanumerics, hyphens, underscores, 10+ chars
        if _BARE_ID_RE.match(s):
            return s
        # /folders/{id} URL pattern
        m = _FOLDERS_RE.search(s)
        if m:
            return m.group(1)
        # ?id={id} query-param pattern
        m = _QUERY_ID_RE.search(s)
        if m:
            return m.group(1)
        raise HTTPException(
            status_code=400,
            detail=(
                "Could not extract a Drive folder ID from the provided value. "
                "Please paste the full folder URL or the bare folder ID."
            ),
        )

    async def link_drive_folder(
        self,
        matter_id: uuid.UUID,
        org_id: uuid.UUID,
        user_id: uuid.UUID,
        folder_id_or_url: str,
        import_existing: bool,
        drive_service,  # GoogleDriveService instance — typed loosely to avoid circular import
    ) -> dict:
        """
        Link a Google Drive folder to a matter.

        Steps:
          1. Parse the folder ID from the URL or bare ID.
          2. Verify the folder exists in Drive and is actually a folder (not a file).
          3. Persist drive_folder_id + drive_folder_url on the matter record.
          4. If import_existing=True, list all files in the folder and create
             MatterDocument + MatterDocumentVersion records for each one,
             skipping files already linked (matched by drive_file_id).
          5. Log a drive_folder_linked activity entry.

        Returns a DriveFolderInfo-shaped dict.
        """
        from googleapiclient.errors import HttpError

        folder_id = self._extract_folder_id(folder_id_or_url)
        matter = await self._get_matter(matter_id, org_id)

        # Verify the folder exists and is accessible
        try:
            meta = (
                drive_service.client.files()
                .get(fileId=folder_id, fields="id,name,mimeType,webViewLink")
                .execute()
            )
        except HttpError as e:
            raise HTTPException(
                status_code=404,
                detail=f"Drive folder not found or not accessible: {e.reason}",
            )

        if meta.get("mimeType") != "application/vnd.google-apps.folder":
            raise HTTPException(
                status_code=400,
                detail="The provided ID points to a file, not a folder.",
            )

        folder_url: str = meta.get("webViewLink", "")
        folder_name: str = meta.get("name", "")

        # Save the folder reference on the matter
        matter.drive_folder_id = folder_id
        matter.drive_folder_url = folder_url

        imported = 0
        file_count = 0

        if import_existing:
            files = await drive_service.list_files(folder_id)
            file_count = len(files)
            imported = await self._import_drive_files(
                matter_id=matter_id,
                org_id=org_id,
                user_id=user_id,
                files=files,
            )

        await self.activity.log(
            matter_id=matter_id,
            org_id=org_id,
            actor_id=user_id,
            event_type="drive_folder_linked",
            payload={
                "folder_id": folder_id,
                "folder_name": folder_name,
                "folder_url": folder_url,
                "files_imported": imported,
            },
        )

        await self.db.commit()

        return {
            "folder_id": folder_id,
            "folder_name": folder_name,
            "folder_url": folder_url,
            "file_count": file_count,
            "imported_count": imported,
        }

    async def sync_drive_folder(
        self,
        matter_id: uuid.UUID,
        org_id: uuid.UUID,
        user_id: uuid.UUID,
        drive_service,
    ) -> dict:
        """
        Re-scan the linked Drive folder and import any files not yet recorded
        as documents on this matter.
        Returns {"file_count": N, "imported_count": M}.
        """
        matter = await self._get_matter(matter_id, org_id)
        if not matter.drive_folder_id:
            raise HTTPException(
                status_code=400,
                detail="This matter has no linked Drive folder. Link one first.",
            )

        files = await drive_service.list_files(matter.drive_folder_id)
        imported = await self._import_drive_files(
            matter_id=matter_id,
            org_id=org_id,
            user_id=user_id,
            files=files,
        )

        if imported:
            await self.activity.log(
                matter_id=matter_id,
                org_id=org_id,
                actor_id=user_id,
                event_type="drive_folder_synced",
                payload={
                    "folder_id": matter.drive_folder_id,
                    "new_files_imported": imported,
                },
            )

        await self.db.commit()
        return {"file_count": len(files), "imported_count": imported}

    async def create_drive_folder(
        self,
        matter_id: uuid.UUID,
        org_id: uuid.UUID,
        user_id: uuid.UUID,
        drive_service,
    ) -> dict:
        """
        Create a new Google Drive folder for this matter and link it.
        The folder is created in the root or a pre-configured root folder.
        """
        matter = await self._get_matter(matter_id, org_id)
        if matter.drive_folder_id:
            raise HTTPException(
                status_code=400,
                detail="This matter already has a linked Drive folder.",
            )

        # Get organisation to check for a root folder ID
        result = await self.db.execute(select(Organisation).where(Organisation.id == org_id))
        org = result.scalar_one_or_none()
        root_id = getattr(org, "google_drive_root_folder_id", None) if org else None

        # Create folder structure
        folder_id, folder_url = await drive_service.create_matter_folder_structure(
            client_name=matter.client.name,
            matter_title=matter.title,
            reference_no=matter.reference_no,
            root_folder_id=root_id,
        )

        matter.drive_folder_id = folder_id
        matter.drive_folder_url = folder_url

        await self.activity.log(
            matter_id=matter_id,
            org_id=org_id,
            actor_id=user_id,
            event_type="drive_folder_created",
            payload={
                "folder_id": folder_id,
                "folder_url": folder_url,
            },
        )

        await self.db.commit()

        return {
            "folder_id": folder_id,
            "folder_name": f"{matter.reference_no} — {matter.title}",
            "folder_url": folder_url,
            "file_count": 0,
            "imported_count": 0,
        }

    async def _import_drive_files(
        self,
        matter_id: uuid.UUID,
        org_id: uuid.UUID,
        user_id: uuid.UUID,
        files: list[dict],
    ) -> int:
        """
        For each Drive file, create a MatterDocument + first MatterDocumentVersion
        if the file is not already linked (matched by drive_file_id).
        Sub-folders inside the linked folder are skipped.
        Returns the count of newly created documents.
        """
        # Fetch existing drive_file_ids to prevent duplicates
        existing_result = await self.db.execute(
            select(MatterDocument.drive_file_id).where(
                MatterDocument.matter_id == matter_id,
                MatterDocument.organisation_id == org_id,
                MatterDocument.is_deleted == False,
            )
        )
        existing_ids: set[str] = {row[0] for row in existing_result.all() if row[0]}

        imported = 0
        for f in files:
            file_id: str = f.get("id", "")
            if not file_id or file_id in existing_ids:
                continue

            # Skip sub-folders
            if f.get("mimeType") == "application/vnd.google-apps.folder":
                continue

            name: str = f.get("name", "Untitled")
            web_url: str = f.get("webViewLink", "")

            doc = MatterDocument(
                matter_id=matter_id,
                organisation_id=org_id,
                added_by=user_id,
                name=name,
                doc_type=DocumentType.other,
                current_version=1,
                drive_file_id=file_id,
                drive_url=web_url,
            )
            self.db.add(doc)
            await self.db.flush()

            version = MatterDocumentVersion(
                document_id=doc.id,
                uploaded_by=user_id,
                version_number=1,
                label="imported from Drive",
                drive_file_id=file_id,
                drive_url=web_url,
            )
            self.db.add(version)
            existing_ids.add(file_id)
            imported += 1

        return imported
