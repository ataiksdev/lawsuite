import apiClient from '../api-client';

export type InvoiceStatus = 'draft' | 'sent' | 'part_paid' | 'paid' | 'overdue' | 'void' | 'written_off';
export type LineItemKind = 'professional_fee' | 'disbursement' | 'expense';

export interface BackendInvoiceLineItem {
  id: string;
  invoice_id: string;
  organisation_id: string;
  matter_id?: string | null;
  fee_arrangement_id?: string | null;
  kind: LineItemKind;
  description: string;
  quantity: number;
  unit_amount_kobo: number;
  amount_kobo: number;
  is_vatable: boolean;
  is_wht_applicable: boolean;
  notes?: string | null;
}

export interface BackendInvoice {
  id: string;
  organisation_id: string;
  client_id: string;
  number?: string | null;
  status: InvoiceStatus;
  issue_date: string;
  due_date?: string | null;
  currency: string;
  subtotal_kobo: number;
  disbursements_kobo: number;
  total_kobo: number;
  net_payable_kobo: number;
  amount_paid_kobo: number;
  vat_kobo: number;
  wht_kobo: number;
  vat_enabled: boolean;
  wht_enabled: boolean;
  is_bill_of_charges: boolean;
  served_at?: string | null;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  line_items: BackendInvoiceLineItem[];
  matter_ids: string[];
  eligible_to_sue_date?: string | null;
}

export interface BackendInvoiceListResponse {
  items: BackendInvoice[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface InvoiceListParams {
  matter_id?: string;
  client_id?: string;
  status?: InvoiceStatus;
  page?: number;
  page_size?: number;
}

export interface LineItemCreatePayload {
  kind: LineItemKind;
  description: string;
  quantity?: number;
  unit_amount_kobo: number;
  amount_kobo?: number;
  matter_id?: string;
  fee_arrangement_id?: string;
  disbursement_id?: string;
  is_vatable?: boolean;
  is_wht_applicable?: boolean;
  notes?: string;
}

export interface LineItemUpdatePayload {
  kind?: LineItemKind;
  description?: string;
  quantity?: number;
  unit_amount_kobo?: number;
  amount_kobo?: number;
  matter_id?: string | null;
  fee_arrangement_id?: string | null;
  is_vatable?: boolean;
  is_wht_applicable?: boolean;
  notes?: string;
}

export interface InvoiceCreatePayload {
  client_id: string;
  issue_date?: string;
  due_date?: string;
  currency?: string;
  notes?: string;
  vat_enabled?: boolean;
  wht_enabled?: boolean;
  is_bill_of_charges?: boolean;
  line_items?: LineItemCreatePayload[];
}

export interface InvoiceUpdatePayload {
  client_id?: string;
  issue_date?: string;
  due_date?: string | null;
  currency?: string;
  notes?: string | null;
  vat_enabled?: boolean;
  wht_enabled?: boolean;
  is_bill_of_charges?: boolean;
  vat_kobo?: number;
  wht_kobo?: number;
}

export async function listInvoices(params: InvoiceListParams = {}) {
  return apiClient.get<BackendInvoiceListResponse>(
    '/invoices',
    params as Record<string, string | number | boolean | undefined>
  );
}

export async function createInvoice(payload: InvoiceCreatePayload) {
  return apiClient.post<BackendInvoice>('/invoices', payload);
}

export async function getInvoice(invoiceId: string) {
  return apiClient.get<BackendInvoice>(`/invoices/${invoiceId}`);
}

export async function updateInvoice(invoiceId: string, payload: InvoiceUpdatePayload) {
  return apiClient.patch<BackendInvoice>(`/invoices/${invoiceId}`, payload);
}

export async function issueInvoice(invoiceId: string) {
  return apiClient.post<BackendInvoice>(`/invoices/${invoiceId}/issue`);
}

export async function voidInvoice(invoiceId: string, reason?: string) {
  return apiClient.post<BackendInvoice>(`/invoices/${invoiceId}/void`, { reason });
}

export async function markServed(invoiceId: string, servedAt?: string) {
  return apiClient.post<BackendInvoice>(`/invoices/${invoiceId}/mark-served`, { served_at: servedAt });
}

export async function addLineItem(invoiceId: string, payload: LineItemCreatePayload) {
  return apiClient.post<BackendInvoice>(`/invoices/${invoiceId}/line-items`, payload);
}

export async function updateLineItem(invoiceId: string, lineItemId: string, payload: LineItemUpdatePayload) {
  return apiClient.patch<BackendInvoice>(`/invoices/${invoiceId}/line-items/${lineItemId}`, payload);
}

export async function deleteLineItem(invoiceId: string, lineItemId: string) {
  return apiClient.delete<BackendInvoice>(`/invoices/${invoiceId}/line-items/${lineItemId}`);
}

export async function getInvoicePdfBlob(invoiceId: string) {
  return apiClient.getBlob(`/invoices/${invoiceId}/pdf`);
}
