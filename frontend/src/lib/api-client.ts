// ============================================================================
// LegalOps - API Client
// Typed fetch wrapper with JWT authentication and token refresh
// ============================================================================

import type { ApiError } from './types';

const ACCESS_TOKEN_KEY = 'lawsuite_access_token';
const REFRESH_TOKEN_KEY = 'lawsuite_refresh_token';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// ============================================================================
// Error Classes
// ============================================================================

export class ApiClientError extends Error {
  status: number;
  detail: string;
  errors?: Record<string, string[]>;

  constructor(status: number, detail: string, errors?: Record<string, string[]>) {
    super(detail);
    this.name = 'ApiClientError';
    this.status = status;
    this.detail = detail;
    this.errors = errors;
  }
}

export class NetworkError extends Error {
  constructor(message = 'Network error. Please check your connection.') {
    super(message);
    this.name = 'NetworkError';
  }
}

export class UnauthorizedError extends Error {
  status = 401;
  detail: string;
  constructor(message: string) {
    super(message);
    this.name = 'UnauthorizedError';
    this.detail = message;
  }
}

export class ForbiddenError extends Error {
  status = 403;
  detail: string;
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
    this.detail = message;
  }
}

/** Thrown when the backend returns HTTP 402 — plan limit or feature gate hit. */
export class PaymentRequiredError extends Error {
  status = 402;
  detail: string;
  constructor(message: string) {
    super(message);
    this.name = 'PaymentRequiredError';
    this.detail = message;
  }
}

export class NotFoundError extends Error {
  status = 404;
  detail: string;
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
    this.detail = message;
  }
}

// ============================================================================
// Request / Response Types
// ============================================================================

interface RequestOptions {
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  signal?: AbortSignal;
  skipAuth?: boolean;
}

interface RequestConfig extends RequestOptions {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
}

// ============================================================================
// Interceptor Types
// ============================================================================

type RequestInterceptor = (config: RequestConfig) => RequestConfig | Promise<RequestConfig>;
type ResponseInterceptor<T> = (response: T) => T | Promise<T>;
type ErrorInterceptor = (error: Error) => Error | Promise<Error>;

// ============================================================================
// API Client Singleton
// ============================================================================

class ApiClient {
  private baseUrl: string;
  private isRefreshing = false;
  private refreshPromise: Promise<string | null> | null = null;
  private requestInterceptors: RequestInterceptor[] = [];
  private responseInterceptors: ResponseInterceptor<unknown>[] = [];
  private errorInterceptors: ErrorInterceptor[] = [];

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  // --------------------------------------------------------------------------
  // Token Management
  // --------------------------------------------------------------------------

  getAccessToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  }

  getRefreshToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  }

  setTokens(accessToken: string, refreshToken: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  }

  clearTokens(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  }

  // --------------------------------------------------------------------------
  // Interceptors
  // --------------------------------------------------------------------------

  addRequestInterceptor(interceptor: RequestInterceptor): () => void {
    this.requestInterceptors.push(interceptor);
    return () => {
      this.requestInterceptors = this.requestInterceptors.filter(i => i !== interceptor);
    };
  }

  addResponseInterceptor(interceptor: ResponseInterceptor<unknown>): () => void {
    this.responseInterceptors.push(interceptor);
    return () => {
      this.responseInterceptors = this.responseInterceptors.filter(i => i !== interceptor);
    };
  }

  addErrorInterceptor(interceptor: ErrorInterceptor): () => void {
    this.errorInterceptors.push(interceptor);
    return () => {
      this.errorInterceptors = this.errorInterceptors.filter(i => i !== interceptor);
    };
  }

  // --------------------------------------------------------------------------
  // Core Request Method
  // --------------------------------------------------------------------------

  private async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    let config: RequestConfig = {
      method: method as RequestConfig['method'],
      path,
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    };

    // Inject auth token
    if (!config.skipAuth) {
      const token = this.getAccessToken();
      if (token) {
        config.headers = { ...config.headers, Authorization: `Bearer ${token}` };
      }
    }

    // Run request interceptors
    for (const interceptor of this.requestInterceptors) {
      config = await interceptor(config);
    }

    // Build URL with query params
    let url = `${this.baseUrl}${config.path}`;
    if (config.params) {
      const searchParams = new URLSearchParams();
      Object.entries(config.params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          searchParams.append(key, String(value));
        }
      });
      const paramString = searchParams.toString();
      if (paramString) url += `?${paramString}`;
    }

    const fetchOptions: RequestInit = {
      method: config.method,
      headers: config.headers,
      signal: config.signal,
    };
    if (config.body && config.method !== 'GET') {
      fetchOptions.body = JSON.stringify(config.body);
    }

    try {
      const response = await fetch(url, fetchOptions);

      // Handle 401 — attempt token refresh once
      if (response.status === 401 && !config.skipAuth) {
        const newToken = await this.refreshToken();
        if (newToken) {
          config.headers = { ...config.headers, Authorization: `Bearer ${newToken}` };
          const retryResponse = await fetch(url, { ...fetchOptions, headers: config.headers });
          if (!retryResponse.ok) throw await this.handleError(retryResponse);
          const data = await retryResponse.json();
          return this.runResponseInterceptors(data) as T;
        } else {
          this.clearTokens();
          throw new UnauthorizedError('Session expired. Please log in again.');
        }
      }

      if (!response.ok) throw await this.handleError(response);

      // 204 No Content
      if (response.status === 204) return undefined as unknown as T;

      const data = await response.json();
      return this.runResponseInterceptors(data) as T;

    } catch (error) {
      if (
        error instanceof ApiClientError ||
        error instanceof PaymentRequiredError ||
        error instanceof UnauthorizedError ||
        error instanceof ForbiddenError ||
        error instanceof NotFoundError
      ) {
        throw await this.runErrorInterceptors(error);
      }
      // Network / connection failure
      if (error instanceof TypeError && error.message.toLowerCase().includes('fetch')) {
        const networkError = new NetworkError();
        throw await this.runErrorInterceptors(networkError);
      }
      throw await this.runErrorInterceptors(error as Error);
    }
  }

  // --------------------------------------------------------------------------
  // Token Refresh
  // --------------------------------------------------------------------------

  private async refreshToken(): Promise<string | null> {
    if (this.isRefreshing && this.refreshPromise) return this.refreshPromise;
    this.isRefreshing = true;
    this.refreshPromise = this.doRefreshToken();
    try {
      return await this.refreshPromise;
    } finally {
      this.isRefreshing = false;
      this.refreshPromise = null;
    }
  }

  private async doRefreshToken(): Promise<string | null> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) return null;
    try {
      const response = await fetch(`${this.baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!response.ok) { this.clearTokens(); return null; }
      const data = await response.json();
      this.setTokens(data.access_token, data.refresh_token);
      return data.access_token;
    } catch {
      this.clearTokens();
      return null;
    }
  }

  // --------------------------------------------------------------------------
  // Error Handling
  // --------------------------------------------------------------------------

  private async handleError(response: Response): Promise<Error> {
    let errorData: ApiError = { detail: 'An unexpected error occurred' };
    try {
      errorData = await response.json();
    } catch {
      // Use default if JSON parse fails
    }

    // FastAPI returns 422 detail as an array of validation errors.
    // Flatten them into a readable string.
    let detail: string;
    if (Array.isArray(errorData.detail)) {
      detail = errorData.detail
        .map((e: { loc?: string[]; msg?: string }) => {
          const field = e.loc ? e.loc.filter((s) => s !== 'body').join('.') : '';
          return field ? `${field}: ${e.msg ?? 'invalid'}` : (e.msg ?? 'invalid value');
        })
        .join('; ');
    } else {
      detail = (errorData.detail as string) || 'An unexpected error occurred';
    }

    switch (response.status) {
      case 400:
        return new ApiClientError(400, detail || 'Bad request', errorData.errors);
      case 401:
        return new UnauthorizedError(detail || 'Unauthorized');
      case 402:
        return new PaymentRequiredError(
          detail || 'Plan limit reached. Upgrade to continue.'
        );
      case 403:
        return new ForbiddenError(detail || 'Access denied.');
      case 404:
        return new NotFoundError(detail || 'Not found');
      case 422:
        return new ApiClientError(422, detail || 'Validation error', errorData.errors);
      case 429:
        return new ApiClientError(429, 'Too many requests. Please try again later.');
      case 500:
        return new ApiClientError(500, 'Server error. Please try again in a moment.');
      case 502:
      case 503:
      case 504:
        return new NetworkError('The server is temporarily unavailable. Please try again.');
      default:
        return new ApiClientError(
          response.status,
          detail || 'An unexpected error occurred'
        );
    }
  }

  // --------------------------------------------------------------------------
  // Interceptor Runners
  // --------------------------------------------------------------------------

  private async runResponseInterceptors<T>(response: T): Promise<T> {
    let result: unknown = response;
    for (const interceptor of this.responseInterceptors) {
      result = await interceptor(result);
    }
    return result as T;
  }

  private async runErrorInterceptors(error: Error): Promise<Error> {
    let result = error;
    for (const interceptor of this.errorInterceptors) {
      result = await interceptor(result);
    }
    return result;
  }

  // --------------------------------------------------------------------------
  // Public HTTP Methods
  // --------------------------------------------------------------------------

  async get<T>(path: string, params?: Record<string, string | number | boolean | undefined>, options?: RequestOptions): Promise<T> {
    return this.request<T>('GET', path, { ...options, params });
  }

  async post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>('POST', path, { ...options, body });
  }

  async patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>('PATCH', path, { ...options, body });
  }

  async put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>('PUT', path, { ...options, body });
  }

  async delete<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('DELETE', path, options);
  }

  // --------------------------------------------------------------------------
  // File Upload
  // --------------------------------------------------------------------------

  async upload<T>(path: string, file: File, fieldName = 'file', additionalData?: Record<string, string>): Promise<T> {
    const token = this.getAccessToken();
    const formData = new FormData();
    formData.append(fieldName, file);
    if (additionalData) {
      Object.entries(additionalData).forEach(([key, value]) => formData.append(key, value));
    }
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: formData,
    });
    if (!response.ok) throw await this.handleError(response);
    return response.json() as Promise<T>;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const apiClient = new ApiClient(BASE_URL);
export default apiClient;
