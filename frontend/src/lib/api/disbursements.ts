import apiClient from '../api-client';

export type DisbursementType = 'agency' | 'recharge';

export interface BackendDisbursement {
  id: string;
  organisation_id: string;
  matter_id: string;
  type: DisbursementType;
  description: string;
  amount_kobo: number;
  incurred_at: string;
  invoiced: boolean;
  invoice_line_item_id?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface DisbursementUpsertPayload {
  type: DisbursementType;
  description: string;
  amount_kobo: number;
  incurred_at: string;
  notes?: string;
}

export async function listDisbursements(matterId: string, unbilledOnly: boolean = false) {
  return apiClient.get<BackendDisbursement[]>(`/matters/${matterId}/disbursements`, {
    unbilled_only: unbilledOnly || undefined,
  });
}

export async function createDisbursement(matterId: string, payload: DisbursementUpsertPayload) {
  return apiClient.post<BackendDisbursement>(`/matters/${matterId}/disbursements`, payload);
}

export async function updateDisbursement(
  matterId: string,
  disbursementId: string,
  payload: Partial<DisbursementUpsertPayload>
) {
  return apiClient.patch<BackendDisbursement>(
    `/matters/${matterId}/disbursements/${disbursementId}`,
    payload
  );
}

export async function deleteDisbursement(matterId: string, disbursementId: string) {
  return apiClient.delete<void>(`/matters/${matterId}/disbursements/${disbursementId}`);
}
