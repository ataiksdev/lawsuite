import { app, BrowserWindow, dialog } from "electron";
import path from "node:path";
import { loadOrCreateRuntimeConfig, writeRuntimeConfig } from "./bootstrap/secrets";
import { initPostgresIfNeeded, startPostgres, stopPostgres, createAppDatabaseIfNeeded } from "./bootstrap/postgres";
import { runAlembicMigrations, startBackend, stopBackend } from "./bootstrap/backend";
import { startFrontend, stopFrontend } from "./bootstrap/frontend";
import { waitForHttpOk } from "./bootstrap/health";
import { ports } from "./bootstrap/ports";
import { logBootstrap } from "./bootstrap/logger";

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;
let shuttingDown = false;

function createSplashWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 360,
    height: 220,
    frame: false,
    resizable: false,
    center: true,
    show: true,
    webPreferences: { contextIsolation: true },
  });
  win.loadFile(path.join(__dirname, "windows", "splash.html"));
  return win;
}

// Best-effort UI feedback so a slow-but-working first launch (antivirus
// scanning each freshly-installed .exe can genuinely take a while) doesn't
// look identical to a hung one. Failures here are non-fatal — the splash
// window may not have finished loading yet on the very first call.
function setSplashStatus(text: string): void {
  splashWindow?.webContents
    .executeJavaScript(`document.getElementById('label') && (document.getElementById('label').textContent = ${JSON.stringify(text)})`)
    .catch(() => {});
}

async function bootstrap(): Promise<void> {
  splashWindow = createSplashWindow();

  const { config } = await loadOrCreateRuntimeConfig();

  setSplashStatus("Preparing local database…");
  await initPostgresIfNeeded(config.pgSuperuserPassword);
  await startPostgres();
  await createAppDatabaseIfNeeded(config.pgSuperuserPassword);

  setSplashStatus("Updating database schema…");
  await runAlembicMigrations(config);

  setSplashStatus("Starting Lawmate…");
  startBackend(config);
  startFrontend();

  await waitForHttpOk(`http://127.0.0.1:${ports.backend}/health`);
  await waitForHttpOk(`http://127.0.0.1:${ports.frontend}/`);

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    webPreferences: { contextIsolation: true, preload: path.join(__dirname, "preload.js") },
  });
  await mainWindow.loadURL(`http://127.0.0.1:${ports.frontend}`);
  mainWindow.show();
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  splashWindow?.close();
  splashWindow = null;

  if (!config.firstRunComplete) {
    writeRuntimeConfig({ ...config, firstRunComplete: true });
  }
}

async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logBootstrap("shutting down child processes...");
  await stopFrontend();
  await stopBackend();
  await stopPostgres();
}

app.whenReady().then(async () => {
  try {
    await bootstrap();
  } catch (err) {
    console.error("[main] bootstrap failed:", err);
    logBootstrap(`FATAL: bootstrap failed: ${String(err)}`);
    dialog.showErrorBox(
      "Lawmate failed to start",
      `Something went wrong while starting Lawmate:\n\n${String(err)}\n\nLogs: ${app.getPath("userData")}\\logs`
    );
    await shutdown();
    app.exit(1);
  }
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", (event) => {
  if (shuttingDown) return;
  event.preventDefault();
  shutdown().then(() => app.quit());
});
