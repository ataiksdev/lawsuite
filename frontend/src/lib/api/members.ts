import apiClient from '../api-client';

export interface BackendMember {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'member' | 'viewer';
  is_active: boolean;
  is_verified: boolean;
  joined_at: string;
  has_pending_invite: boolean;
}

export interface MemberSummary {
  id: string;
  email: string;
  full_name: string;
  first_name: string;
  last_name: string;
  role: 'admin' | 'member' | 'viewer';
  is_active: boolean;
  joined_at: string;
  has_pending_invite: boolean;
}

function splitFullName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return {
    first_name: parts[0] ?? '',
    last_name: parts.slice(1).join(' '),
  };
}

export function mapMember(member: BackendMember): MemberSummary {
  return {
    id: member.id,
    email: member.email,
    full_name: member.full_name,
    role: member.role,
    is_active: member.is_active,
    joined_at: member.joined_at,
    has_pending_invite: member.has_pending_invite,
    ...splitFullName(member.full_name),
  };
}

export async function listMembers() {
  const members = await apiClient.get<BackendMember[]>('/auth/members');
  return members.map(mapMember);
}

export async function inviteMember(payload: {
  email: string;
  full_name: string;
  role: 'admin' | 'member' | 'viewer';
}) {
  return apiClient.post<{
    message: string;
    user_id: string;
    invite_url: string;
  }>('/auth/invite', payload);
}

export async function resendInvite(userId: string) {
  return apiClient.post<{
    message: string;
    invite_url: string;
  }>(`/auth/members/${userId}/resend-invite`);
}

export async function updateMemberRole(
  userId: string,
  payload: { role: 'admin' | 'member' | 'viewer' }
) {
  const member = await apiClient.patch<BackendMember>(`/auth/members/${userId}/role`, payload);
  return mapMember(member);
}

export async function removeMember(userId: string) {
  return apiClient.delete<void>(`/auth/members/${userId}`);
}
