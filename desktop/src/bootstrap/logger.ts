import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { logsDir } from "./paths";

// A persistent, always-on trail of every bootstrap step — the individual
// step log files (postgres.log, backend.log, ...) only exist once that
// step actually starts producing output, which left no record at all when
// something hung *before* reaching a given step. This file always gets a
// line the moment a step begins, so a stuck launch is diagnosable from
// logs alone instead of requiring live process inspection.
export function logBootstrap(message: string): void {
  mkdirSync(logsDir, { recursive: true });
  const line = `[${new Date().toISOString()}] ${message}\n`;
  appendFileSync(path.join(logsDir, "bootstrap.log"), line, "utf-8");
  console.log(`[bootstrap] ${message}`);
}
