import { app } from "electron";
import path from "node:path";

// In a packaged build, bundled resources live under process.resourcesPath
// (electron-builder's extraResources target). In dev (`npm start`), they
// live in desktop/resources/ relative to this file's compiled location
// (desktop/dist-src/bootstrap/paths.js).
export const resourcesRoot = app.isPackaged
  ? process.resourcesPath
  : path.join(__dirname, "..", "..", "resources");

export const pythonExe = path.join(resourcesRoot, "python", "python.exe");
export const postgresBinDir = path.join(resourcesRoot, "postgres", "bin");
export const nodeExe = path.join(resourcesRoot, "node", "node.exe");
export const backendDir = path.join(resourcesRoot, "backend");
export const frontendServerJs = path.join(resourcesRoot, "frontend", "standalone", "server.js");
export const frontendCwd = path.join(resourcesRoot, "frontend", "standalone");

// Per-user, persists across installs/updates/uninstalls of the app itself
// (NSIS doesn't touch this directory) — %APPDATA%\lawmate-desktop on Windows.
export const userDataDir = app.getPath("userData");
export const pgDataDir = path.join(userDataDir, "pgdata");
export const logsDir = path.join(userDataDir, "logs");
export const configDir = path.join(userDataDir, "config");
export const runtimeConfigPath = path.join(configDir, "runtime.json");
export const pgPasswordFile = path.join(userDataDir, "pgdata-pwfile.tmp");
// Org logo uploads — see backend/app/services/local_storage_service.py.
export const localStorageDir = path.join(userDataDir, "uploads");

// Optional, gitignored, developer-local Google OAuth credentials — see
// desktop/.env.desktop and 05-stage-backend.mjs (which copies it here if
// present). Not required for the app to run; only for Google integration.
export const desktopEnvFile = path.join(resourcesRoot, ".env.desktop");
