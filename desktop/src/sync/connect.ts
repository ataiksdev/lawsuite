import { loadOrCreateRuntimeConfig, writeRuntimeConfig } from "../bootstrap/secrets";
import { logBootstrap } from "../bootstrap/logger";
import { fernetDecrypt, fernetEncrypt } from "./crypto";

interface LoginResponse {
  mfa_required: boolean;
  access_token?: string;
  refresh_token?: string;
  mfa_token?: string;
}

export interface ConnectResult {
  success: boolean;
  error?: string;
}

export async function connectToCloud(cloudUrl: string, email: string, password: string): Promise<ConnectResult> {
  const normalizedUrl = cloudUrl.replace(/\/+$/, "");
  let response: Response;
  try {
    response = await fetch(`${normalizedUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch (err) {
    return { success: false, error: `Could not reach ${normalizedUrl}: ${String(err)}` };
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { detail?: string } | null;
    return { success: false, error: body?.detail || `Login failed (${response.status})` };
  }

  const body = (await response.json()) as LoginResponse;
  if (body.mfa_required) {
    return {
      success: false,
      error: "This cloud account has two-factor authentication enabled. Sync doesn't support MFA-protected accounts yet — use an account without MFA for the cloud connection.",
    };
  }
  if (!body.refresh_token) {
    return { success: false, error: "Cloud login succeeded but returned no refresh token." };
  }

  const { config } = await loadOrCreateRuntimeConfig();
  const encryptedRefreshToken = await fernetEncrypt(body.refresh_token, config.encryptionKey);
  writeRuntimeConfig({
    ...config,
    cloudUrl: normalizedUrl,
    cloudRefreshToken: encryptedRefreshToken,
  });
  logBootstrap(`sync: connected to cloud (${normalizedUrl})`);
  return { success: true };
}

export async function disconnectFromCloud(): Promise<void> {
  const { config } = await loadOrCreateRuntimeConfig();
  const { cloudUrl: _cloudUrl, cloudRefreshToken: _cloudRefreshToken, ...rest } = config;
  writeRuntimeConfig(rest);
  logBootstrap("sync: disconnected from cloud");
}

// Exchanges the stored (encrypted) refresh token for a fresh access token.
// Called at the start of every sync — access tokens are short-lived by
// design (see backend/app/core/config.py's access_token_expire_minutes),
// so a stored one from connect-time would be stale almost immediately.
export async function getCloudAccessToken(): Promise<{ accessToken: string; cloudUrl: string } | null> {
  const { config } = await loadOrCreateRuntimeConfig();
  if (!config.cloudUrl || !config.cloudRefreshToken) return null;

  const refreshToken = await fernetDecrypt(config.cloudRefreshToken, config.encryptionKey);
  const response = await fetch(`${config.cloudUrl}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!response.ok) {
    throw new Error(`Cloud session expired or was revoked (${response.status}) — reconnect to cloud.`);
  }
  const body = (await response.json()) as { access_token: string };
  return { accessToken: body.access_token, cloudUrl: config.cloudUrl };
}
