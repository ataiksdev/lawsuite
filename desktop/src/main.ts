import { app, BrowserWindow, dialog } from "electron";
import path from "node:path";
import { readFileSync } from "node:fs";
import { loadOrCreateRuntimeConfig, writeRuntimeConfig } from "./bootstrap/secrets";
import { initPostgresIfNeeded, startPostgres, stopPostgres, createAppDatabaseIfNeeded } from "./bootstrap/postgres";
import { runAlembicMigrations, startBackend, stopBackend } from "./bootstrap/backend";
import { startFrontend, stopFrontend } from "./bootstrap/frontend";
import { waitForHttpOk } from "./bootstrap/health";
import { ports } from "./bootstrap/ports";
import { logBootstrap } from "./bootstrap/logger";
import { logsDir } from "./bootstrap/paths";

// Chromium's GPU process can fail to initialize on machines with limited or
// problematic graphics drivers (common on VMs and some laptops) — when it
// does, Electron treats it as fatal and the whole app terminates silently
// within milliseconds, before any of our own code (or its logging) has a
// chance to run further. disableHardwareAcceleration() alone still lets
// Chromium try to launch a GPU process for compositing (just without real
// hardware); these switches go further and avoid needing a GPU process at
// all. Must all be set before app.whenReady().
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("in-process-gpu");
// Chromium's OS-level sandbox for child processes (GPU, renderer, network
// service) can fail to initialize on restricted/virtualized machines —
// the standard fix, also required for e.g. running Chromium in Docker/CI.
app.commandLine.appendSwitch("no-sandbox");
// --no-sandbox doesn't reliably cover the network service's own sandbox on
// this environment (observed as repeated "Network service crashed,
// restarting service" loops) — this flag targets it explicitly.
app.commandLine.appendSwitch("disable-features", "NetworkServiceSandbox");

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

  setSplashStatus("Starting Lawmate… (first launch can take a minute)");
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

function readLogTail(filename: string, lines = 15): string {
  try {
    const content = readFileSync(path.join(logsDir, filename), "utf-8");
    return content.split("\n").filter(Boolean).slice(-lines).join("\n");
  } catch {
    return "(not written yet)";
  }
}

app.whenReady().then(async () => {
  try {
    await bootstrap();
  } catch (err) {
    console.error("[main] bootstrap failed:", err);
    logBootstrap(`FATAL: bootstrap failed: ${String(err)}`);
    dialog.showErrorBox(
      "Lawmate failed to start",
      `Something went wrong while starting Lawmate:\n\n${String(err)}\n\n` +
        `--- backend.log (last lines) ---\n${readLogTail("backend.log")}\n\n` +
        `--- postgres.log (last lines) ---\n${readLogTail("postgres.log")}\n\n` +
        `Full logs: ${app.getPath("userData")}\\logs`
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
