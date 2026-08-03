import { app, BrowserWindow, dialog } from "electron";
import path from "node:path";
import { loadOrCreateRuntimeConfig, writeRuntimeConfig } from "./bootstrap/secrets";
import { initPostgresIfNeeded, startPostgres, stopPostgres, createAppDatabaseIfNeeded } from "./bootstrap/postgres";
import { runAlembicMigrations, startBackend, stopBackend } from "./bootstrap/backend";
import { startFrontend, stopFrontend } from "./bootstrap/frontend";
import { waitForHttpOk } from "./bootstrap/health";
import { ports } from "./bootstrap/ports";

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

async function bootstrap(): Promise<void> {
  splashWindow = createSplashWindow();

  const { config } = loadOrCreateRuntimeConfig();

  initPostgresIfNeeded(config.pgSuperuserPassword);
  startPostgres();
  createAppDatabaseIfNeeded(config.pgSuperuserPassword);

  runAlembicMigrations(config);
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
  console.log("[main] shutting down child processes...");
  await stopFrontend();
  await stopBackend();
  stopPostgres();
}

app.whenReady().then(async () => {
  try {
    await bootstrap();
  } catch (err) {
    console.error("[main] bootstrap failed:", err);
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
