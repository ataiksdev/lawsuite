# backend/app/services/google_docs_service.py
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from google.oauth2.credentials import Credentials
from fastapi import HTTPException, status


class GoogleDocsService:
    """
    Wraps the Google Docs API (docs.googleapis.com/v1).

    Used for:
      - Creating a new document from a Drive template by copying it
      - Substituting placeholder variables ({{client_name}} etc.)
      - Reading document content for report export (Phase 9)

    Requires scope: https://www.googleapis.com/auth/documents
    The Drive API is also needed for the file copy operation.
    """

    def __init__(self, credentials: Credentials):
        self.credentials = credentials
        self._docs_client = None
        self._drive_client = None

    @property
    def docs(self):
        if not self._docs_client:
            self._docs_client = build("docs", "v1", credentials=self.credentials)
        return self._docs_client

    @property
    def drive(self):
        if not self._drive_client:
            self._drive_client = build("drive", "v3", credentials=self.credentials)
        return self._drive_client

    # ── Template operations ───────────────────────────────────────────────

    async def create_from_template(
        self,
        template_file_id: str,
        new_title: str,
        destination_folder_id: str | None,
        substitutions: dict[str, str],
    ) -> dict:
        """
        Copy a Drive template file and replace all {{placeholders}} in it.

        Steps:
          1. Copy the template to a new file (Drive API — files.copy)
          2. Batch-replace all placeholder text (Docs API — batchUpdate)

        Returns {"file_id": ..., "drive_url": ..., "title": ...}

        substitutions example:
          {
            "{{client_name}}":  "Acme Industries Ltd",
            "{{matter_ref}}":   "MAT-2025-0001",
            "{{matter_title}}": "Nigeria Tax Act 2025 Compliance Review",
            "{{date}}":         "15 June 2025",
            "{{lawyer_name}}":  "Chidi Okeke",
          }
        """
        # Step 1: Copy template
        copy_body: dict = {"name": new_title}
        if destination_folder_id:
            copy_body["parents"] = [destination_folder_id]

        try:
            copied = (
                self.drive.files()
                .copy(
                    fileId=template_file_id,
                    body=copy_body,
                    fields="id,name,webViewLink",
                )
                .execute()
            )
        except HttpError as e:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Failed to copy template: {e.reason}",
            )

        new_file_id = copied["id"]

        # Step 2: Replace all placeholders in one batchUpdate call
        if substitutions:
            requests = [
                {
                    "replaceAllText": {
                        "containsText": {
                            "text": placeholder,
                            "matchCase": True,
                        },
                        "replaceText": replacement,
                    }
                }
                for placeholder, replacement in substitutions.items()
            ]

            try:
                self.docs.documents().batchUpdate(
                    documentId=new_file_id,
                    body={"requests": requests},
                ).execute()
            except HttpError as e:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Failed to substitute template variables: {e.reason}",
                )

        return {
            "file_id": new_file_id,
            "drive_url": copied.get("webViewLink", ""),
            "title": new_title,
        }

    async def list_templates(self, templates_folder_id: str) -> list[dict]:
        """
        List all Google Docs files in the org's templates folder.
        Returns file metadata usable to render a template picker in the UI.
        """
        try:
            results = (
                self.drive.files()
                .list(
                    q=(
                        f"'{templates_folder_id}' in parents "
                        f"and mimeType='application/vnd.google-apps.document' "
                        f"and trashed=false"
                    ),
                    fields="files(id,name,webViewLink,modifiedTime)",
                    orderBy="name",
                    pageSize=50,
                )
                .execute()
            )
            return results.get("files", [])
        except HttpError as e:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Failed to list templates: {e.reason}",
            )

    async def get_or_create_templates_folder(
        self, org_name: str
    ) -> str:
        """
        Find or create the LegalOps Templates folder for this org.
        Returns the folder_id.
        """
        folder_name = f"LegalOps Templates — {org_name}"
        query = (
            f"name='{folder_name}' "
            f"and mimeType='application/vnd.google-apps.folder' "
            f"and trashed=false"
        )
        try:
            results = (
                self.drive.files()
                .list(q=query, fields="files(id)", pageSize=1)
                .execute()
            )
            files = results.get("files", [])
            if files:
                return files[0]["id"]

            # Create it
            folder = (
                self.drive.files()
                .create(
                    body={
                        "name": folder_name,
                        "mimeType": "application/vnd.google-apps.folder",
                    },
                    fields="id",
                )
                .execute()
            )
            return folder["id"]
        except HttpError as e:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Failed to access templates folder: {e.reason}",
            )

    async def export_as_pdf_url(self, file_id: str) -> str:
        """
        Return a URL that downloads the Google Doc as a PDF.
        Used by the report generator in Phase 9.
        """
        return f"https://docs.google.com/document/d/{file_id}/export?format=pdf"
