# backend/app/api/documents.py
import uuid
from fastapi import APIRouter, status
from app.core.deps import AuthUser, GoogleCreds, DB
from app.services.document_service import DocumentService
from app.services.google_drive_service import GoogleDriveService
from app.services.google_docs_service import GoogleDocsService
from datetime import date
from sqlalchemy import select
from app.models.organisation import Organisation
from app.models.matter import Matter
from app.models.client import Client
from app.models.matter_document import DocumentType
import fastapi
from app.schemas.document import (
    GenerateFromTemplateRequest,
    DocumentLink,
    DocumentVersionUpload,
    DocumentStatusUpdate,
    DocumentResponse,
    DocumentVersionResponse,
    DriveFileResponse,
)

router = APIRouter()


@router.get("/{matter_id}/documents", response_model=list[DocumentResponse])
async def list_documents(matter_id: uuid.UUID, current_user: AuthUser, db: DB):
    """
    List all documents linked to a matter.
    Includes full version history per document.
    """
    service = DocumentService(db)
    docs = await service.list_documents(matter_id, current_user.org_id)
    return [DocumentResponse.model_validate(d) for d in docs]


@router.post(
    "/{matter_id}/documents",
    response_model=DocumentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def link_document(
    matter_id: uuid.UUID,
    payload: DocumentLink,
    current_user: AuthUser,
    db: DB,
):
    """
    Link an existing Google Drive file to this matter.
    Creates the first version record automatically.
    Logs a document_added activity entry.
    """
    service = DocumentService(db)
    doc = await service.link_document(
        matter_id=matter_id,
        org_id=current_user.org_id,
        user_id=current_user.user_id,
        data=payload,
    )
    return DocumentResponse.model_validate(doc)


@router.post(
    "/{matter_id}/documents/{doc_id}/versions",
    response_model=DocumentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_document_version(
    matter_id: uuid.UUID,
    doc_id: uuid.UUID,
    payload: DocumentVersionUpload,
    current_user: AuthUser,
    db: DB,
):
    """
    Upload a new version of a document (e.g. replace unsigned with signed).
    Increments current_version. Old versions remain accessible in history.
    If the label contains 'sign', document status is auto-set to 'signed'.
    """
    service = DocumentService(db)
    doc = await service.add_version(
        doc_id=doc_id,
        matter_id=matter_id,
        org_id=current_user.org_id,
        user_id=current_user.user_id,
        data=payload,
    )
    return DocumentResponse.model_validate(doc)


@router.get(
    "/{matter_id}/documents/{doc_id}/versions",
    response_model=list[DocumentVersionResponse],
)
async def get_document_versions(
    matter_id: uuid.UUID,
    doc_id: uuid.UUID,
    current_user: AuthUser,
    db: DB,
):
    """
    Full version history for a document, newest first.
    Each version has its own Drive file ID and URL.
    """
    service = DocumentService(db)
    versions = await service.get_versions(
        doc_id=doc_id,
        matter_id=matter_id,
        org_id=current_user.org_id,
    )
    return [DocumentVersionResponse.model_validate(v) for v in versions]


@router.patch("/{matter_id}/documents/{doc_id}/status", response_model=DocumentResponse)
async def update_document_status(
    matter_id: uuid.UUID,
    doc_id: uuid.UUID,
    payload: DocumentStatusUpdate,
    current_user: AuthUser,
    db: DB,
):
    """Manually update a document's status (draft, pending_signature, signed, superseded)."""
    service = DocumentService(db)
    doc = await service.update_status(
        doc_id=doc_id,
        matter_id=matter_id,
        org_id=current_user.org_id,
        user_id=current_user.user_id,
        new_status=payload.status,
    )
    return DocumentResponse.model_validate(doc)


@router.delete("/{matter_id}/documents/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    matter_id: uuid.UUID,
    doc_id: uuid.UUID,
    current_user: AuthUser,
    db: DB,
):
    """
    Soft-delete a document. The document and its versions are
    hidden from listings but preserved for audit purposes.
    Does NOT delete the file from Google Drive.
    """
    service = DocumentService(db)
    await service.delete_document(
        doc_id=doc_id,
        matter_id=matter_id,
        org_id=current_user.org_id,
        user_id=current_user.user_id,
    )


@router.get("/{matter_id}/drive-files", response_model=list[DriveFileResponse])
async def list_drive_files(
    matter_id: uuid.UUID,
    current_user: AuthUser,
    google_creds: GoogleCreds,
    db: DB,
):
    """
    List files directly from the matter's Google Drive folder.
    Requires Google Workspace to be connected.
    Returns raw Drive file metadata — useful for picking files to link.
    """
    result = await db.execute(
        select(Matter).where(
            Matter.id == matter_id,
            Matter.organisation_id == current_user.org_id,
        )
    )
    matter = result.scalar_one_or_none()
    if not matter:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Matter not found")

    if not matter.drive_folder_id:
        return []

    drive_service = GoogleDriveService(db, google_creds)
    files = await drive_service.list_files(matter.drive_folder_id)

    return [
        DriveFileResponse(
            id=f["id"],
            name=f["name"],
            mime_type=f.get("mimeType", ""),
            web_view_link=f.get("webViewLink", ""),
            modified_time=f.get("modifiedTime"),
            size=f.get("size"),
        )
        for f in files
    ]


# ─── Phase 7: Generate document from template ─────────────────────────────────

@router.post(
    "/{matter_id}/documents/from-template",
    response_model=DocumentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def generate_from_template(
    matter_id: uuid.UUID,
    payload: "GenerateFromTemplateRequest",
    current_user: AuthUser,
    google_creds: GoogleCreds,
    db: DB,
):
    """
    Generate a new document from a Google Docs template.
    Steps:
      1. Fetches the matter + client details for substitution variables
      2. Copies the template file in Drive
      3. Replaces all {{placeholders}} in the copy
      4. Links the new file to the matter as a document record
    Standard substitutions always injected:
      {{client_name}}, {{matter_ref}}, {{matter_title}},
      {{matter_type}}, {{date}}
    Pass extra_substitutions for any additional custom variables.
    """
    # Fetch matter + client
    matter_result = await db.execute(
        select(Matter).where(
            Matter.id == matter_id,
            Matter.organisation_id == current_user.org_id,
        )
    )
    matter = matter_result.scalar_one_or_none()
    if not matter:
        raise fastapi.HTTPException(status_code=404, detail="Matter not found")

    client_result = await db.execute(
        select(Client).where(Client.id == matter.client_id)
    )
    client = client_result.scalar_one_or_none()

    # Build standard substitutions
    substitutions = {
        "{{client_name}}":  client.name if client else "",
        "{{matter_ref}}":   matter.reference_no,
        "{{matter_title}}": matter.title,
        "{{matter_type}}":  matter.matter_type.value.replace("_", " ").title(),
        "{{date}}":         date.today().strftime("%d %B %Y"),
        "{{lawyer_name}}":  "",  # filled from user profile in future
    }
    substitutions.update(payload.extra_substitutions)

    # Generate the doc
    docs_service = GoogleDocsService(google_creds)
    result = await docs_service.create_from_template(
        template_file_id=payload.template_file_id,
        new_title=payload.document_name,
        destination_folder_id=matter.drive_folder_id,
        substitutions=substitutions,
    )

    # Link the generated file to the matter
    doc_service = DocumentService(db)
    try:
        doc_type = DocumentType(payload.doc_type)
    except ValueError:
        doc_type = DocumentType.other

    doc = await doc_service.link_document(
        matter_id=matter_id,
        org_id=current_user.org_id,
        user_id=current_user.user_id,
        data=DocumentLink(
            name=payload.document_name,
            drive_file_id=result["file_id"],
            drive_url=result["drive_url"],
            doc_type=doc_type,
            label="generated from template",
        ),
    )
    return DocumentResponse.model_validate(doc)
    

@router.get("/{matter_id}/templates", response_model=list[dict])
async def list_templates(
    matter_id: uuid.UUID,
    current_user: AuthUser,
    google_creds: GoogleCreds,
    db: DB,
):
    """
    List available document templates from the org's Drive templates folder.
    Requires Google Workspace to be connected.
    """
    org_result = await db.execute(
        select(Organisation).where(Organisation.id == current_user.org_id)
    )
    org = org_result.scalar_one()

    docs_service = GoogleDocsService(google_creds)
    folder_id = await docs_service.get_or_create_templates_folder(org.name)
    templates = await docs_service.list_templates(folder_id)

    return [
        {
            "file_id": t["id"],
            "name": t["name"],
            "web_view_link": t.get("webViewLink", ""),
            "modified_time": t.get("modifiedTime"),
        }
        for t in templates
    ]