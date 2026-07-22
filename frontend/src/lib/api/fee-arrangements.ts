import apiClient from '../api-client';

export type FeeArrangementType = 'fixed' | 'retainer' | 'scale' | 'milestone' | 'recovery' | 'appearance';

export interface BackendFeeArrangement {
  id: string;
  organisation_id: string;
  matter_id: string;
  type: FeeArrangementType;
  params: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FeeArrangementUpsertPayload {
  type: FeeArrangementType;
  params: Record<string, unknown>;
}

export async function listFeeArrangements(matterId: string) {
  return apiClient.get<BackendFeeArrangement[]>(`/matters/${matterId}/fee-arrangements`);
}

export async function createFeeArrangement(matterId: string, payload: FeeArrangementUpsertPayload) {
  return apiClient.post<BackendFeeArrangement>(`/matters/${matterId}/fee-arrangements`, payload);
}

export async function updateFeeArrangement(
  matterId: string,
  feeArrangementId: string,
  payload: Partial<FeeArrangementUpsertPayload> & { is_active?: boolean }
) {
  return apiClient.patch<BackendFeeArrangement>(
    `/matters/${matterId}/fee-arrangements/${feeArrangementId}`,
    payload
  );
}
