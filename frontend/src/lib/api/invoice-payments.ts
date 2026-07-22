import apiClient from '../api-client';

export type PaymentMethod = 'paystack' | 'bank_transfer' | 'cash' | 'cheque';

export interface BackendPayment {
  id: string;
  organisation_id: string;
  invoice_id: string;
  amount_kobo: number;
  method: PaymentMethod;
  paid_at: string;
  reference: string;
  wht_withheld_kobo?: number | null;
  wht_credit_note_received: boolean;
  created_at: string;
}

export interface PaymentCreatePayload {
  invoice_id: string;
  amount_kobo: number;
  method: PaymentMethod;
  paid_at: string;
  reference: string;
  wht_withheld_kobo?: number;
  wht_credit_note_received?: boolean;
}

export async function recordPayment(payload: PaymentCreatePayload) {
  return apiClient.post<BackendPayment>('/invoice-payments', payload);
}

export async function listPayments(invoiceId: string) {
  return apiClient.get<BackendPayment[]>('/invoice-payments', { invoice_id: invoiceId });
}
