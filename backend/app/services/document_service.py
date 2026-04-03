# backend/app/services/document_service.py
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from fastapi import HTTPException, status

from app.models.matter import Matter
from app.models.matter_document import (
    MatterDocument,
    MatterDocumentVersion,
    DocumentStatus,
)
from app.schemas.document import DocumentLink, DocumentVersionUpload
from app.services.activity_service import ActivityService


class DocumentService:

    def __init__(self, db: AsyncSession):
        self.db = db
        self.activity = ActivityService(db)

    # ── Helpers ───────────────────────────────────────────────────────────

    async def _get_matter(self, matter_id: uuid.UUID, org_id: uuid.UUID) -> Matter:
        result = await self.db.execute(
            select(Matter).where(
                Matter.id == matter_id,
                Matter.organisation_id == org_id,
            )
        )
        matter = result.scalar_one_or_none()
        if not matter:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Matter not found",
            )
        return matter

    async def _get_document(
        self, doc_id: uuid.UUID, matter_id: uuid.UUID, org_id: uuid.UUID
    ) -> MatterDocument:
        result = await self.db.execute(
            select(MatterDocument)
            .options(selectinload(MatterDocument.versions))
            .where(
                MatterDocument.id == doc_id,
                MatterDocument.matter_id == matter_id,
                MatterDocument.organisation_id == org_id,
                MatterDocument.is_deleted == False,
            )
        )
        doc = result.scalar_one_or_none()
        if not doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Document not found",
            )
        return doc

    # ── List ──────────────────────────────────────────────────────────────

    async def list_documents(
        self,
        matter_id: uuid.UUID,
        org_id: uuid.UUID,
    ) -> list[MatterDocument]:
        await self._get_matter(matter_id, org_id)

        result = await self.db.execute(
            select(MatterDocument)
            .options(selectinload(MatterDocument.versions))
            .where(
                MatterDocument.matter_id == matter_id,
                MatterDocument.organisation_id == org_id,
                MatterDocument.is_deleted == False,
            )
            .order_by(MatterDocument.added_at.desc())
        )
        return list(result.scalars().all())

    # ── Link existing Drive file ──────────────────────────────────────────

    async def link_document(
        self,
        matter_id: uuid.UUID,
        org_id: uuid.UUID,
        user_id: uuid.UUID,
        data: DocumentLink,
    ) -> MatterDocument:
        await self._get_matter(matter_id, org_id)

        doc = MatterDocument(
            matter_id=matter_id,
            organisation_id=org_id,
            added_by=user_id,
            name=data.name.strip(),
            doc_type=data.doc_type,
            status=DocumentStatus.draft,
            current_version=1,
            drive_file_id=data.drive_file_id,
            drive_url=data.drive_url,
        )
        self.db.add(doc)
        await self.db.flush()

        # Create the first version record
        version = MatterDocumentVersion(
            document_id=doc.id,
            uploaded_by=user_id,
            version_number=1,
            label=data.label or "initial version",
            drive_file_id=data.drive_file_id,
            drive_url=data.drive_url,
        )
        self.db.add(version)

        await self.activity.log(
            matter_id=matter_id,
            org_id=org_id,
            actor_id=user_id,
            event_type="document_added",
            payload={
                "document_id": str(doc.id),
                "name": doc.name,
                "doc_type": doc.doc_type,
                "drive_url": doc.drive_url,
            },
        )

        await self.db.commit()
        return await self._get_document(doc.id, matter_id, org_id)

    # ── Add new version ───────────────────────────────────────────────────

    async def add_version(
        self,
        doc_id: uuid.UUID,
        matter_id: uuid.UUID,
        org_id: uuid.UUID,
        user_id: uuid.UUID,
        data: DocumentVersionUpload,
    ) -> MatterDocument:
        doc = await self._get_document(doc_id, matter_id, org_id)

        new_version_number = doc.current_version + 1

        version = MatterDocumentVersion(
            document_id=doc.id,
            uploaded_by=user_id,
            version_number=new_version_number,
            label=data.label,
            drive_file_id=data.drive_file_id,
            drive_url=data.drive_url,
            notes=data.notes,
        )
        # self.db.add(version)
        doc.versions.append(version)

        # Update the document's current pointer
        doc.current_version = new_version_number
        doc.drive_file_id = data.drive_file_id
        doc.drive_url = data.drive_url

        # Auto-advance status when a signed copy is uploaded
        if data.label and "sign" in data.label.lower():
            doc.status = DocumentStatus.signed

        await self.activity.log(
            matter_id=matter_id,
            org_id=org_id,
            actor_id=user_id,
            event_type="document_version_added",
            payload={
                "document_id": str(doc.id),
                "name": doc.name,
                "version": new_version_number,
                "label": data.label,
                "drive_url": data.drive_url,
            },
        )

        await self.db.commit()
        return await self._get_document(doc.id, matter_id, org_id)

    # ── Update status ─────────────────────────────────────────────────────

    async def update_status(
        self,
        doc_id: uuid.UUID,
        matter_id: uuid.UUID,
        org_id: uuid.UUID,
        user_id: uuid.UUID,
        new_status: DocumentStatus,
    ) -> MatterDocument:
        doc = await self._get_document(doc_id, matter_id, org_id)
        old_status = doc.status
        doc.status = new_status

        await self.activity.log(
            matter_id=matter_id,
            org_id=org_id,
            actor_id=user_id,
            event_type="document_status_changed",
            payload={
                "document_id": str(doc.id),
                "name": doc.name,
                "from": old_status,
                "to": new_status,
            },
        )

        await self.db.commit()
        return await self._get_document(doc.id, matter_id, org_id)

    # ── Soft delete ───────────────────────────────────────────────────────

    async def delete_document(
        self,
        doc_id: uuid.UUID,
        matter_id: uuid.UUID,
        org_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> None:
        doc = await self._get_document(doc_id, matter_id, org_id)
        doc.is_deleted = True

        await self.activity.log(
            matter_id=matter_id,
            org_id=org_id,
            actor_id=user_id,
            event_type="document_removed",
            payload={"document_id": str(doc.id), "name": doc.name},
        )
        await self.db.commit()

    # ── Version history ───────────────────────────────────────────────────

    async def get_versions(
        self,
        doc_id: uuid.UUID,
        matter_id: uuid.UUID,
        org_id: uuid.UUID,
    ) -> list[MatterDocumentVersion]:
        doc = await self._get_document(doc_id, matter_id, org_id)
        result = await self.db.execute(
            select(MatterDocumentVersion)
            .where(MatterDocumentVersion.document_id == doc.id)
            .order_by(MatterDocumentVersion.version_number.desc())
        )
        return list(result.scalars().all())

    # ── Called by webhook Celery task ─────────────────────────────────────

    async def log_external_edit(
        self,
        drive_file_id: str,
        org_id: uuid.UUID,
        editor_name: str | None,
        change_type: str,
        timestamp: str | None,
    ) -> bool:
        """
        Called from the Celery task after a Drive webhook fires.
        Finds the document by drive_file_id and writes an activity log entry.
        Returns True if the document was found and logged, False if not tracked.
        """
        result = await self.db.execute(
            select(MatterDocument).where(
                MatterDocument.drive_file_id == drive_file_id,
                MatterDocument.organisation_id == org_id,
                MatterDocument.is_deleted == False,
            )
        )
        doc = result.scalar_one_or_none()
        if not doc:
            return False

        await self.activity.log(
            matter_id=doc.matter_id,
            org_id=org_id,
            actor_id=None,  # external edit — no app user ID
            event_type="document_edited",
            payload={
                "document_id": str(doc.id),
                "name": doc.name,
                "drive_file_id": drive_file_id,
                "edited_by": editor_name or "Unknown",
                "change_type": change_type,
                "timestamp": timestamp,
            },
        )
        await self.db.commit()
        return True
