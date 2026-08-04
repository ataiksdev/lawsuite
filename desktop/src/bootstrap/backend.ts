import { spawn, ChildProcess } from "node:child_process";
import { createWriteStream, mkdirSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pythonExe, backendDir, logsDir, localStorageDir, desktopEnvFile } from "./paths";
import { ports } from "./ports";
import { runAsync } from "./proc";
import { logBootstrap } from "./logger";
import type { RuntimeConfig } from "./secrets";

// Optional, gitignored developer-local overrides (currently just Google
// OAuth credentials) — see desktop/.env.desktop. Simple KEY=VALUE parsing,
// no need for a full dotenv dependency for two lines.
function loadDesktopEnvOverrides(): Record<string, string> {
  if (!existsSync(desktopEnvFile)) return {};
  const overrides: Record<string, string> = {};
  for (const line of readFileSync(desktopEnvFile, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    overrides[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return overrides;
}

function buildBackendEnv(config: RuntimeConfig): NodeJS.ProcessEnv {
  const databaseUrl = `postgresql://postgres:${config.pgSuperuserPassword}@127.0.0.1:${ports.postgres}/lawmate`;
  const desktopOverrides = loadDesktopEnvOverrides();
  return {
    ...process.env,
    DATABASE_URL: databaseUrl,
    DATABASE_URL_SYNC: databaseUrl,
    JWT_SECRET: config.jwtSecret,
    ENCRYPTION_KEY: config.encryptionKey,
    // Anything other than "production" avoids main.py's boot-time
    // RuntimeError when paystack_secret_key is unset (which it always is
    // here, since Paystack billing isn't relevant to a local desktop org).
    APP_ENV: "desktop",
    APP_URL: `http://127.0.0.1:${ports.backend}`,
    FRONTEND_URL: `http://127.0.0.1:${ports.frontend}`,
    // Required — the default cors_origins list (backend/app/core/config.py)
    // only allows localhost:3000 and two unrelated dev origins; without
    // this every request from the bundled frontend's port is CORS-blocked.
    CORS_ORIGINS: JSON.stringify([`http://127.0.0.1:${ports.frontend}`]),
    // Google's oauthlib refuses non-HTTPS redirect URIs by default; this is
    // the standard escape hatch for a genuinely local, non-public callback.
    OAUTHLIB_INSECURE_TRANSPORT: "1",
    // Firm logos are saved to disk and served back by this same backend
    // instead of requiring Supabase Storage — see
    // backend/app/services/local_storage_service.py.
    LOCAL_STORAGE_DIR: localStorageDir,
    // Google Workspace integration — GOOGLE_CLIENT_ID/SECRET come from the
    // optional .env.desktop override (empty string if not present, same as
    // the hosted app's default — integration just stays unavailable).
    // These specific redirect URIs must be added as Authorized redirect
    // URIs on that OAuth client in Google Cloud Console — the port is fixed
    // across every desktop install, so this is a one-time addition, not
    // per-client.
    GOOGLE_CLIENT_ID: desktopOverrides.GOOGLE_CLIENT_ID ?? "",
    GOOGLE_CLIENT_SECRET: desktopOverrides.GOOGLE_CLIENT_SECRET ?? "",
    GOOGLE_REDIRECT_URI: `http://127.0.0.1:${ports.backend}/integrations/google/callback`,
    GOOGLE_SIGNIN_REDIRECT_URI: `http://127.0.0.1:${ports.backend}/auth/google/callback`,
  };
}

// Mirrors render.yaml's production boot sequence exactly:
// `alembic upgrade head && uvicorn app.main:app ...`.
export async function runAlembicMigrations(config: RuntimeConfig): Promise<void> {
  mkdirSync(logsDir, { recursive: true });
  logBootstrap("backend: running alembic upgrade head");
  const result = await runAsync(pythonExe, ["-m", "alembic", "upgrade", "head"], {
    cwd: backendDir, // alembic.ini's script_location is a relative path
    env: buildBackendEnv(config),
  });
  if (result.status !== 0) {
    throw new Error(`alembic upgrade head failed:\n${result.stdout}\n${result.stderr}`);
  }
  logBootstrap("backend: migrations complete");
}

let backendProcess: ChildProcess | null = null;

export function startBackend(config: RuntimeConfig): ChildProcess {
  logBootstrap("backend: starting uvicorn");
  // Truncate per launch — backend.log has no per-line timestamps, so an
  // appended file spanning many launches makes it impossible to tell which
  // run a given line belongs to. bootstrap.log (timestamped) keeps the
  // cross-run history.
  const logStream = createWriteStream(path.join(logsDir, "backend.log"), { flags: "w" });
  const child = spawn(
    pythonExe,
    ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(ports.backend)],
    { cwd: backendDir, env: buildBackendEnv(config) }
  );
  child.stdout?.pipe(logStream);
  child.stderr?.pipe(logStream);
  backendProcess = child;
  return child;
}

export function stopBackend(): Promise<void> {
  return new Promise((resolve) => {
    if (!backendProcess || backendProcess.exitCode !== null) {
      resolve();
      return;
    }
    backendProcess.once("exit", () => resolve());
    backendProcess.kill();
    // uvicorn should exit promptly on SIGTERM; don't let a stuck process
    // hang app quit indefinitely.
    setTimeout(resolve, 5000);
  });
}
