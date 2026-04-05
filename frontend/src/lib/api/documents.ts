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
