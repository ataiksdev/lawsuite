import apiClient from '../api-client';

export type BackendDocumentType =
  | 'engagement_letter'
  | 'memo'
  | 'contract'
  | 'filing'
  | 'correspondence'
  | 'report'
  | 'other';

export type BackendDocumentStatus =
  | 'draft'
  | 'pending_signature'
  | 'signed'
  | 'superseded';

export interface BackendDocumentVersion {
  id: string;
  document_id: string;
  version_number: number;
  label?: string | null;
  drive_file_id: string;
  drive_url: string;
  notes?: string | null;
  uploaded_by?: string | null;
  uploaded_at: string;
}

export interface BackendDocument {
  id: string;
  matter_id: string;
  organisation_id: string;
  name: string;
  doc_type: BackendDocumentType;
  status: BackendDocumentStatus;
  current_version: number;
  drive_file_id?: string | null;
  drive_url?: string | null;
  added_by?: string | null;
  added_at: string;
  updated_at: string;
  versions: BackendDocumentVersion[];
}

export interface DocumentVersionUploadPayload {
  drive_file_id: string;
  drive_url: string;
  label?: string;
  notes?: string;
}

export interface LinkDocumentPayload {
  name: string;
  drive_file_id: string;
  drive_url: string;
  doc_type: BackendDocumentType;
  label?: string;
}

export interface DriveFileResponse {
  id: string;
  name: string;
  mime_type: string;
  web_view_link: string;
  modified_time?: string | null;
  size?: string | null;
}

export interface TemplateFileResponse {
  file_id: string;
  name: string;
  web_view_link: string;
  modified_time?: string | null;
}

export interface GenerateFromTemplatePayload {
  template_file_id: string;
  document_name: string;
  doc_type: BackendDocumentType;
  extra_substitutions?: Record<string, string>;
}

export async function listDocuments(matterId: string) {
  return apiClient.get<BackendDocument[]>(`/matters/${matterId}/documents`);
}

export async function linkDocument(matterId: string, payload: LinkDocumentPayload) {
  return apiClient.post<BackendDocument>(`/matters/${matterId}/documents`, payload);
}

export async function addDocumentVersion(
  matterId: string,
  documentId: string,
  payload: DocumentVersionUploadPayload
) {
  return apiClient.post<BackendDocument>(
    `/matters/${matterId}/documents/${documentId}/versions`,
    payload
  );
}

export async function getDocumentVersions(matterId: string, documentId: string) {
  return apiClient.get<BackendDocumentVersion[]>(
    `/matters/${matterId}/documents/${documentId}/versions`
  );
}

export async function updateDocumentStatus(
  matterId: string,
  documentId: string,
  status: BackendDocumentStatus
) {
  return apiClient.patch<BackendDocument>(
    `/matters/${matterId}/documents/${documentId}/status`,
    { status }
  );
}

export async function listDriveFiles(matterId: string) {
  return apiClient.get<DriveFileResponse[]>(`/matters/${matterId}/drive-files`);
}

export async function listTemplates(matterId: string) {
  return apiClient.get<TemplateFileResponse[]>(`/matters/${matterId}/templates`);
}

export async function generateDocumentFromTemplate(
  matterId: string,
  payload: GenerateFromTemplatePayload
) {
  return apiClient.post<BackendDocument>(
    `/matters/${matterId}/documents/from-template`,
    payload
  );
}

export async function deleteDocument(matterId: string, documentId: string) {
  return apiClient.delete<void>(`/matters/${matterId}/documents/${documentId}`);
}

/**
 * Upload a file from the browser directly to Google Drive via the backend.
 * Uses multipart/form-data so the backend can stream it to the Drive API.
 *
 * @param matterId    The matter this document belongs to.
 * @param file        The File object from a file input or drag-and-drop.
 * @param docType     Document type enum value (defaults to "other").
 * @param label       Optional label string (e.g. "unsigned draft").
 * @param documentName  Optional override for the display name.
 *                      Defaults to file.name if omitted.
 * @param onProgress  Optional callback receiving 0–100 upload percentage.
 *                    Fired via XMLHttpRequest progress events.
 */
export async function uploadDocumentToDrive(
  matterId: string,
  file: File,
  options: {
    docType?: BackendDocumentType;
    label?: string;
    documentName?: string;
    onProgress?: (pct: number) => void;
  } = {}
): Promise<BackendDocument> {
  const { docType = 'other', label = '', documentName = '', onProgress } = options;

  const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  const token = localStorage.getItem('lawsuite_access_token');

  const formData = new FormData();
  formData.append('file', file);
  formData.append('doc_type', docType);
  formData.append('label', label);
  formData.append('document_name', documentName || file.name);

  return new Promise<BackendDocument>((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      });
    }

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as BackendDocument);
        } catch {
          reject(new Error('Invalid response from server'));
        }
      } else {
        try {
          const err = JSON.parse(xhr.responseText) as { detail?: string };
          reject(new Error(err.detail || `Upload failed with status ${xhr.status}`));
        } catch {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
    xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));

    xhr.open('POST', `${BASE_URL}/matters/${matterId}/documents/upload`);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.send(formData);
  });
}
