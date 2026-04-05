// ============================================================================
// LegalOps - TypeScript Types & Interfaces
// Nigerian Legal Operations Management Platform
// ============================================================================

// NOTE:
// This file intentionally stays broader than the backend API modules under
// `src/lib/api/*`. The app now uses backend-shaped types for real network work,
// while these shared UI types still support demo fixtures in `mock-data.ts`.

// ============================================================================
// Enums
// ============================================================================

export enum UserRole {
  ADMIN = 'admin',
  MEMBER = 'member',
  VIEWER = 'viewer',
}

export enum MatterType {
  ADVISORY = 'advisory',
  LITIGATION = 'litigation',
  COMPLIANCE = 'compliance',
  DRAFTING = 'drafting',
  TRANSACTIONAL = 'transactional',
}

export enum MatterStatus {
  INTAKE = 'intake',
  OPEN = 'open',
  PENDING = 'pending',
  IN_REVIEW = 'in_review',
  CLOSED = 'closed',
  ARCHIVED = 'archived',
}

export enum TaskStatus {
  TODO = 'todo',
  IN_PROGRESS = 'in_progress',
  DONE = 'done',
  CANCELLED = 'cancelled',
}

export enum TaskPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

export enum DocumentType {
  ENGAGEMENT_LETTER = 'engagement_letter',
  MEMO = 'memo',
  CONTRACT = 'contract',
  FILING = 'filing',
  CORRESPONDENCE = 'correspondence',
  REPORT = 'report',
  OTHER = 'other',
}

export enum DocumentStatus {
  DRAFT = 'draft',
  PENDING_SIGNATURE = 'pending_signature',
  SIGNED = 'signed',
  SUPERSEDED = 'superseded',
}

export type SubscriptionPlan =
  | 'free'
  | 'pro'
  | 'agency'
  | 'starter'
  | 'professional'
  | 'enterprise';

// ============================================================================
// Core Domain Models
// ============================================================================

export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone?: string;
  role: UserRole;
  avatar_url?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Organisation {
  id: string;
  name: string;
  slug: string;
  logo_url?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  rc_number?: string; // Nigerian Corporate Affairs Commission registration number
  plan: SubscriptionPlan;
  created_at: string;
  updated_at: string;
}

export interface Client {
  id: string;
  organisation_id: string;
  name: string;
  type: 'individual' | 'corporate';
  email?: string;
  phone?: string;
  address?: string;
  company_name?: string;
  rc_number?: string;
  contact_person?: string;
  notes?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Matter {
  id: string;
  organisation_id: string;
  client_id: string;
  title: string;
  description?: string;
  matter_number: string;
  matter_type: MatterType;
  status: MatterStatus;
  assigned_to?: string; // user id
  priority: TaskPriority;
  court?: string;
  case_number?: string;
  judge?: string;
  opposing_counsel?: string;
  filing_date?: string;
  hearing_date?: string;
  next_action?: string;
  next_action_date?: string;
  estimated_value?: number;
  currency?: string;
  tags?: string[];
  is_billable: boolean;
  billed_amount?: number;
  created_at: string;
  updated_at: string;
  // Joined fields
  client?: Client;
  assignee?: User;
  task_count?: number;
  document_count?: number;
}

export interface Task {
  id: string;
  organisation_id: string;
  matter_id?: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigned_to?: string; // user id
  due_date?: string;
  completed_at?: string;
  created_by: string; // user id
  tags?: string[];
  created_at: string;
  updated_at: string;
  // Joined fields
  matter?: Matter;
  assignee?: User;
}

export interface MatterDocument {
  id: string;
  organisation_id: string;
  matter_id: string;
  title: string;
  description?: string;
  document_type: DocumentType;
  status: DocumentStatus;
  file_url?: string;
  file_size?: number;
  mime_type?: string;
  uploaded_by: string; // user id
  version: number;
  created_at: string;
  updated_at: string;
  // Joined fields
  matter?: Matter;
  uploader?: User;
  versions?: MatterDocumentVersion[];
}

export interface MatterDocumentVersion {
  id: string;
  document_id: string;
  file_url: string;
  file_size: number;
  version: number;
  uploaded_by: string;
  change_note?: string;
  created_at: string;
  uploader?: User;
}

export interface MatterEmail {
  id: string;
  organisation_id: string;
  matter_id: string;
  thread_id?: string;
  subject: string;
  body_text?: string;
  body_html?: string;
  from_address: string;
  from_name?: string;
  to_addresses: string[];
  cc_addresses?: string[];
  bcc_addresses?: string[];
  direction: 'incoming' | 'outgoing';
  email_date: string;
  is_read: boolean;
  is_starred: boolean;
  has_attachments: boolean;
  matter?: Matter;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  organisation_id: string;
  user_id: string;
  action: string;
  entity_type: 'matter' | 'task' | 'document' | 'client' | 'user';
  entity_id: string;
  description: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  user?: User;
}

export interface Report {
  id: string;
  organisation_id: string;
  name: string;
  description?: string;
  report_type: 'matter_summary' | 'task_summary' | 'revenue' | 'client_activity' | 'time_tracking' | 'custom';
  date_from?: string;
  date_to?: string;
  created_by: string;
  data?: Record<string, unknown>;
  created_at: string;
  creator?: User;
}

// ============================================================================
// Request / Response Schemas
// ============================================================================

// Auth
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  organisation_name: string;
  phone?: string;
}

export interface AuthResponse {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  user: UserResponse;
  organisation: OrgResponse;
  tokens?: TokenResponse;
}

export interface RefreshTokenRequest {
  refresh_token: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in?: number;
}

// User
export interface UserResponse {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone?: string;
  role: UserRole;
  avatar_url?: string;
  is_active: boolean;
  created_at: string;
}

export interface UpdateProfileRequest {
  first_name?: string;
  last_name?: string;
  phone?: string;
  avatar_url?: string;
}

export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
}

export interface InviteUserRequest {
  email: string;
  first_name: string;
  last_name: string;
  role: UserRole;
}

export interface UpdateUserRoleRequest {
  role: UserRole;
}

// Organisation
export interface OrgResponse {
  id: string;
  name: string;
  slug: string;
  logo_url?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  rc_number?: string;
  plan: SubscriptionPlan;
  member_count?: number;
  matter_count?: number;
  created_at: string;
}

export interface UpdateOrgRequest {
  name?: string;
  logo_url?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
}

// Client
export interface ClientResponse {
  id: string;
  name: string;
  type: 'individual' | 'corporate';
  email?: string;
  phone?: string;
  address?: string;
  company_name?: string;
  rc_number?: string;
  contact_person?: string;
  notes?: string;
  is_active: boolean;
  matter_count?: number;
  created_at: string;
  updated_at: string;
}

export interface CreateClientRequest {
  name: string;
  type: 'individual' | 'corporate';
  email?: string;
  phone?: string;
  address?: string;
  company_name?: string;
  rc_number?: string;
  contact_person?: string;
  notes?: string;
}

export interface UpdateClientRequest {
  name?: string;
  type?: 'individual' | 'corporate';
  email?: string;
  phone?: string;
  address?: string;
  company_name?: string;
  rc_number?: string;
  contact_person?: string;
  notes?: string;
  is_active?: boolean;
}

// Matter
export interface MatterResponse {
  id: string;
  title: string;
  description?: string;
  matter_number: string;
  matter_type: MatterType;
  status: MatterStatus;
  assigned_to?: string;
  priority: TaskPriority;
  court?: string;
  case_number?: string;
  judge?: string;
  opposing_counsel?: string;
  filing_date?: string;
  hearing_date?: string;
  next_action?: string;
  next_action_date?: string;
  estimated_value?: number;
  currency?: string;
  tags?: string[];
  is_billable: boolean;
  billed_amount?: number;
  client_id: string;
  client?: ClientResponse;
  assignee?: UserResponse;
  task_count?: number;
  document_count?: number;
  created_at: string;
  updated_at: string;
}

export interface CreateMatterRequest {
  title: string;
  description?: string;
  matter_type: MatterType;
  client_id: string;
  assigned_to?: string;
  priority?: TaskPriority;
  court?: string;
  case_number?: string;
  judge?: string;
  opposing_counsel?: string;
  filing_date?: string;
  hearing_date?: string;
  estimated_value?: number;
  currency?: string;
  tags?: string[];
  is_billable?: boolean;
}

export interface UpdateMatterRequest {
  title?: string;
  description?: string;
  matter_type?: MatterType;
  status?: MatterStatus;
  assigned_to?: string;
  priority?: TaskPriority;
  court?: string;
  case_number?: string;
  judge?: string;
  opposing_counsel?: string;
  filing_date?: string;
  hearing_date?: string;
  next_action?: string;
  next_action_date?: string;
  estimated_value?: number;
  currency?: string;
  tags?: string[];
  is_billable?: boolean;
  billed_amount?: number;
}

// Task
export interface TaskResponse {
  id: string;
  organisation_id?: string;
  created_by?: string;
  title: string;
  description?: string;
  notes?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigned_to?: string;
  due_date?: string;
  completed_at?: string;
  matter_id?: string;
  is_deleted?: boolean;
  tags?: string[];
  matter?: MatterResponse;
  assignee?: UserResponse;
  created_at: string;
  updated_at: string;
}

export interface CreateTaskRequest {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigned_to?: string;
  due_date?: string;
  matter_id?: string;
  tags?: string[];
}

export interface UpdateTaskRequest {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigned_to?: string;
  due_date?: string;
  tags?: string[];
}

// Document
export interface DocumentResponse {
  id: string;
  title: string;
  description?: string;
  document_type: DocumentType;
  status: DocumentStatus;
  file_url?: string;
  file_size?: number;
  mime_type?: string;
  version: number;
  matter_id: string;
  uploaded_by?: string;
  matter?: MatterResponse;
  uploader?: UserResponse;
  versions?: DocumentVersionResponse[];
  created_at: string;
  updated_at: string;
}

export interface DocumentVersionResponse {
  id: string;
  file_url: string;
  file_size: number;
  version: number;
  change_note?: string;
  created_at: string;
  uploader?: UserResponse;
}

export interface CreateDocumentRequest {
  title: string;
  description?: string;
  document_type: DocumentType;
  matter_id: string;
  status?: DocumentStatus;
}

export interface UpdateDocumentRequest {
  title?: string;
  description?: string;
  document_type?: DocumentType;
  status?: DocumentStatus;
}

// Activity
export interface ActivityResponse {
  id: string;
  action: string;
  entity_type: 'matter' | 'task' | 'document' | 'client' | 'user';
  entity_id: string;
  description: string;
  metadata?: Record<string, unknown>;
  user?: UserResponse;
  created_at: string;
}

// Report
export interface ReportResponse {
  id: string;
  name: string;
  description?: string;
  report_type: 'matter_summary' | 'task_summary' | 'revenue' | 'client_activity' | 'time_tracking' | 'custom';
  date_from?: string;
  date_to?: string;
  data?: Record<string, unknown>;
  creator?: UserResponse;
  created_at: string;
}

export interface CreateReportRequest {
  name: string;
  description?: string;
  report_type: 'matter_summary' | 'task_summary' | 'revenue' | 'client_activity' | 'time_tracking' | 'custom';
  date_from?: string;
  date_to?: string;
}

// Dashboard
export interface DashboardStats {
  total_matters: number;
  open_matters: number;
  pending_tasks: number;
  overdue_tasks: number;
  total_clients: number;
  active_clients: number;
  total_revenue: number;
  pending_invoiced: number;
  matters_by_type: Record<string, number>;
  matters_by_status: Record<string, number>;
  recent_activities: ActivityResponse[];
  upcoming_deadlines: TaskResponse[];
}

// ============================================================================
// Generic / Utility Types
// ============================================================================

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface PaginationParams {
  page?: number;
  page_size?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  search?: string;
}

export interface ApiError {
  detail: string;
  status_code?: number;
  errors?: Record<string, string[]>;
}

// ============================================================================
// Notification Types
// ============================================================================

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  is_read: boolean;
  entity_type?: string;
  entity_id?: string;
  link?: string;
  created_at: string;
}

// ============================================================================
// Integration Types
// ============================================================================

export interface Integration {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon_url?: string;
  is_connected: boolean;
  connected_at?: string;
  settings?: Record<string, string>;
}

export interface BillingInfo {
  plan: SubscriptionPlan;
  current_period_start: string;
  current_period_end: string;
  member_count: number;
  member_limit: number;
  storage_used: number;
  storage_limit: number;
  matter_count: number;
}
