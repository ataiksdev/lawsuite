// ============================================================================
// LegalOps - Authentication Store
// Zustand store with persist middleware for JWT auth state
// ============================================================================

'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { toast } from 'sonner';
import apiClient, { UnauthorizedError, ApiClientError } from './api-client';
import type {
  UserResponse,
  OrgResponse,
  RegisterRequest,
} from './types';
import { UserRole } from './types';

interface BackendTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

// FIX: Backend login now returns mfa_required flag
interface BackendLoginResponse {
  mfa_required: boolean;
  // Present when mfa_required === false
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  // Present when mfa_required === true
  mfa_token?: string;
}

interface BackendAuthUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  is_verified: boolean;
  created_at: string;
}

interface BackendAuthOrganisation {
  id: string;
  name: string;
  slug: string;
  plan: 'free' | 'pro' | 'agency';
  is_active: boolean;
  created_at: string;
}

interface BackendRegisterResponse {
  user: BackendAuthUser;
  organisation: BackendAuthOrganisation;
  tokens: BackendTokenResponse;
}

function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? '',
    lastName: parts.slice(1).join(' '),
  };
}

function mapBackendUser(user: BackendAuthUser): UserResponse {
  const { firstName, lastName } = splitFullName(user.full_name);
  return {
    id: user.id,
    email: user.email,
    first_name: firstName,
    last_name: lastName,
    role: user.role as UserRole,
    is_active: user.is_active,
    created_at: user.created_at,
  };
}

function mapBackendOrganisation(org: BackendAuthOrganisation): OrgResponse {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    plan: org.plan,
    created_at: org.created_at,
  };
}

// ============================================================================
// State Interface
// ============================================================================

interface AuthState {
  user: UserResponse | null;
  organisation: OrgResponse | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // MFA pending state — set when login requires a second factor
  mfaPending: boolean;
  mfaToken: string | null;

  login: (email: string, password: string) => Promise<{ mfaRequired: boolean }>;
  completeMfaLogin: (code: string) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  acceptInvite: (token: string, password: string) => Promise<void>;
  logout: () => void;
  refreshAuth: () => Promise<void>;
  loadFromStorage: () => void;
  clearError: () => void;
  setUser: (user: UserResponse) => void;
  setOrganisation: (org: OrgResponse) => void;
}

// ============================================================================
// Store
// ============================================================================

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // --------------------------------------------------------------------------
      // State
      // --------------------------------------------------------------------------
      user: null,
      organisation: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      mfaPending: false,
      mfaToken: null,

      // --------------------------------------------------------------------------
      // Actions
      // --------------------------------------------------------------------------

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          // FIX: Backend now returns { mfa_required, access_token? } or { mfa_required, mfa_token }
          const data = await apiClient.post<BackendLoginResponse>('/auth/login', {
            email,
            password,
          }, { skipAuth: true });

          if (data.mfa_required && data.mfa_token) {
            // Step 1 of MFA login — store the short-lived mfa_token
            set({
              mfaPending: true,
              mfaToken: data.mfa_token,
              isLoading: false,
              error: null,
            });
            return { mfaRequired: true };
          }

          // No MFA — complete login immediately
          if (!data.access_token || !data.refresh_token) {
            throw new Error('Incomplete token response from server');
          }

          apiClient.setTokens(data.access_token, data.refresh_token);

          const [user, organisation] = await Promise.all([
            apiClient.get<BackendAuthUser>('/auth/me'),
            apiClient.get<BackendAuthOrganisation>('/auth/organisation'),
          ]);
          const mappedUser = mapBackendUser(user);

          set({
            user: mappedUser,
            organisation: mapBackendOrganisation(organisation),
            isAuthenticated: true,
            isLoading: false,
            error: null,
            mfaPending: false,
            mfaToken: null,
          });

          toast.success(`Welcome back, ${mappedUser.first_name || 'there'}!`);
          return { mfaRequired: false };
        } catch (error) {
          const message =
            error instanceof ApiClientError
              ? error.detail
              : 'Login failed. Please check your credentials.';
          set({
            isLoading: false,
            error: message,
            user: null,
            organisation: null,
            isAuthenticated: false,
            mfaPending: false,
            mfaToken: null,
          });
          apiClient.clearTokens();
          toast.error(message);
          throw error;
        }
      },

      completeMfaLogin: async (code: string) => {
        const { mfaToken } = get();
        if (!mfaToken) {
          throw new Error('No MFA token available. Please log in again.');
        }

        set({ isLoading: true, error: null });
        try {
          const data = await apiClient.post<BackendTokenResponse>(
            '/auth/mfa/validate',
            { mfa_token: mfaToken, code },
            { skipAuth: true }
          );

          apiClient.setTokens(data.access_token, data.refresh_token);

          const [user, organisation] = await Promise.all([
            apiClient.get<BackendAuthUser>('/auth/me'),
            apiClient.get<BackendAuthOrganisation>('/auth/organisation'),
          ]);
          const mappedUser = mapBackendUser(user);

          set({
            user: mappedUser,
            organisation: mapBackendOrganisation(organisation),
            isAuthenticated: true,
            isLoading: false,
            error: null,
            mfaPending: false,
            mfaToken: null,
          });

          toast.success(`Welcome back, ${mappedUser.first_name || 'there'}!`);
        } catch (error) {
          const message =
            error instanceof ApiClientError
              ? error.detail
              : 'Invalid MFA code. Please try again.';
          set({ isLoading: false, error: message });
          toast.error(message);
          throw error;
        }
      },

      register: async (data: RegisterRequest) => {
        set({ isLoading: true, error: null });
        try {
          const response = await apiClient.post<BackendRegisterResponse>('/auth/register', {
            org_name: data.organisation_name,
            full_name: `${data.first_name} ${data.last_name}`.trim(),
            email: data.email,
            password: data.password,
          });

          apiClient.setTokens(
            response.tokens.access_token,
            response.tokens.refresh_token
          );

          set({
            user: mapBackendUser(response.user),
            organisation: mapBackendOrganisation(response.organisation),
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });

          toast.success('Account created successfully! Welcome to LegalOps.');
        } catch (error) {
          const message =
            error instanceof ApiClientError
              ? error.detail
              : 'Registration failed. Please try again.';
          set({
            isLoading: false,
            error: message,
          });
          toast.error(message);
          throw error;
        }
      },

      acceptInvite: async (token: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const tokens = await apiClient.post<BackendTokenResponse>(
            '/auth/accept-invite',
            { token, password },
            { skipAuth: true }
          );

          apiClient.setTokens(tokens.access_token, tokens.refresh_token);

          const [user, organisation] = await Promise.all([
            apiClient.get<BackendAuthUser>('/auth/me'),
            apiClient.get<BackendAuthOrganisation>('/auth/organisation'),
          ]);

          set({
            user: mapBackendUser(user),
            organisation: mapBackendOrganisation(organisation),
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });

          toast.success('Invitation accepted! Welcome to LegalOps.');
        } catch (error) {
          const message =
            error instanceof ApiClientError
              ? error.detail
              : 'Failed to accept invitation. Please try again.';

          set({
            isLoading: false,
            error: message,
            user: null,
            organisation: null,
            isAuthenticated: false,
          });
          apiClient.clearTokens();
          toast.error(message);
          throw error;
        }
      },

      logout: () => {
        apiClient.clearTokens();
        set({
          user: null,
          organisation: null,
          isAuthenticated: false,
          isLoading: false,
          error: null,
          mfaPending: false,
          mfaToken: null,
        });
        toast.success('You have been logged out.');
      },

      refreshAuth: async () => {
        try {
          const token = apiClient.getAccessToken();
          if (!token) {
            set({ isAuthenticated: false, user: null, organisation: null });
            return;
          }

          const [user, organisation] = await Promise.all([
            apiClient.get<BackendAuthUser>('/auth/me'),
            apiClient.get<BackendAuthOrganisation>('/auth/organisation'),
          ]);

          set({
            user: mapBackendUser(user),
            organisation: mapBackendOrganisation(organisation),
            isAuthenticated: true,
          });
        } catch (error) {
          if (error instanceof UnauthorizedError) {
            apiClient.clearTokens();
            set({
              user: null,
              organisation: null,
              isAuthenticated: false,
            });
          }
        }
      },

      loadFromStorage: () => {
        const token = apiClient.getAccessToken();
        if (token) {
          set({ isAuthenticated: true, isLoading: true });
          get().refreshAuth();
        }
      },

      clearError: () => set({ error: null }),

      setUser: (user: UserResponse) => set({ user }),

      setOrganisation: (org: OrgResponse) => set({ organisation: org }),
    }),
    {
      name: 'lawsuite-auth',
      partialize: (state) => ({
        user: state.user,
        organisation: state.organisation,
        isAuthenticated: state.isAuthenticated,
        // Don't persist mfa state — it's short-lived
      }),
    }
  )
);

export default useAuthStore;
