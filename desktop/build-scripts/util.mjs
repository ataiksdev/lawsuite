// Shared helpers for the desktop build-scripts pipeline.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, cpSync, createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const desktopDir = path.resolve(fileURLToPath(import.meta.url), "..", "..");
export const repoRoot = path.resolve(desktopDir, "..");
export const frontendDir = path.join(repoRoot, "frontend");
export const backendDir = path.join(repoRoot, "backend");
export const resourcesDir = path.join(desktopDir, "resources");
export const cacheDir = path.join(desktopDir, ".cache");

export const ports = JSON.parse(
  readFileSync(path.join(desktopDir, "shared", "ports.json"), "utf-8")
);

export function run(command, args, opts = {}) {
  console.log(`[run] ${command} ${args.join(" ")} ${opts.cwd ? `(cwd: ${opts.cwd})` : ""}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    ...opts,
  });
  if (result.status !== 0) {
    throw new Error(`Command failed (exit ${result.status}): ${command} ${args.join(" ")}`);
  }
}

export function ensureCleanDir(dir) {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
  mkdirSync(dir, { recursive: true });
}

export function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function copyDir(src, dest, filter) {
  ensureDir(path.dirname(dest));
  cpSync(src, dest, { recursive: true, filter });
}

// Downloads to `dest` if not already cached there — build inputs (Python,
// Postgres, Node) are large and pinned by version, so re-downloading on
// every build run is wasted time/bandwidth.
export async function downloadCached(url, dest) {
  if (existsSync(dest)) {
    console.log(`[cache hit] ${dest}`);
    return dest;
  }
  ensureDir(path.dirname(dest));
  console.log(`[download] ${url} -> ${dest}`);
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Download failed (${response.status}): ${url}`);
  }
  const fileStream = createWriteStream(dest);
  await finished(Readable.fromWeb(response.body).pipe(fileStream));
  return dest;
}

// Windows-only build pipeline — shells out to PowerShell's Expand-Archive
// rather than pulling in a zip-extraction npm dependency.
//
// Expand-Archive is slow on archives with thousands of small files (the
// Postgres zip alone took several minutes) — skip it entirely when destDir
// already has content, same "trust an existing cache" policy as
// downloadCached. A partial/corrupted prior extraction is no more likely
// here than a partial download there, so this doesn't introduce new risk.
export function extractZip(zipPath, destDir) {
  if (existsSync(destDir) && readdirSync(destDir).length > 0) {
    console.log(`[cache hit] ${destDir} already extracted`);
    return;
  }
  ensureDir(destDir);
  run("powershell", [
    "-NoProfile",
    "-Command",
    `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${destDir}' -Force`,
  ]);
}
