import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, unlinkSync, readFileSync } from "node:fs";
import path from "node:path";
import { postgresBinDir, pgDataDir, pgPasswordFile, logsDir } from "./paths";
import { ports } from "./ports";

function pg(binary: string, args: string[]) {
  const exe = path.join(postgresBinDir, binary);
  console.log(`[postgres] ${binary} ${args.join(" ")}`);
  const result = spawnSync(exe, args, { encoding: "utf-8" });
  if (result.status !== 0) {
    throw new Error(
      `${binary} failed (exit ${result.status}):\n${result.stdout}\n${result.stderr}`
    );
  }
  return result;
}

function isInitialized(): boolean {
  // initdb populates PG_VERSION as its last step — a reliable "did initdb
  // actually finish" marker, safer than just checking the directory exists
  // (which mkdirSync creates before initdb runs).
  return existsSync(path.join(pgDataDir, "PG_VERSION"));
}

export function initPostgresIfNeeded(pgSuperuserPassword: string): void {
  if (isInitialized()) return;

  mkdirSync(pgDataDir, { recursive: true });
  mkdirSync(logsDir, { recursive: true });

  writeFileSync(pgPasswordFile, pgSuperuserPassword, "utf-8");
  try {
    pg("initdb.exe", [
      "-D",
      pgDataDir,
      "-U",
      "postgres",
      "-A",
      "password",
      `--pwfile=${pgPasswordFile}`,
      "-E",
      "UTF8",
    ]);
  } finally {
    unlinkSync(pgPasswordFile);
  }

  // initdb's own `-A password` already writes `host all all 127.0.0.1/32
  // md5` into pg_hba.conf — only the port/listen_addresses need patching.
  const confPath = path.join(pgDataDir, "postgresql.conf");
  const conf = readFileSync(confPath, "utf-8");
  const patched = conf
    .replace(/^#?port\s*=.*$/m, `port = ${ports.postgres}`)
    .replace(/^#?listen_addresses\s*=.*$/m, `listen_addresses = '127.0.0.1'`);
  writeFileSync(confPath, patched, "utf-8");
}

export function startPostgres(): void {
  pg("pg_ctl.exe", [
    "-D",
    pgDataDir,
    "-l",
    path.join(logsDir, "postgres.log"),
    "-w",
    "start",
  ]);
}

export function stopPostgres(): void {
  if (!isInitialized()) return;
  try {
    pg("pg_ctl.exe", ["-D", pgDataDir, "-m", "fast", "stop"]);
  } catch (err) {
    // Best-effort on shutdown — don't block app quit over this.
    console.error("[postgres] stop failed:", err);
  }
}

export function createAppDatabaseIfNeeded(pgSuperuserPassword: string): void {
  const check = spawnSync(path.join(postgresBinDir, "psql.exe"), [
    "-h",
    "127.0.0.1",
    "-p",
    String(ports.postgres),
    "-U",
    "postgres",
    "-tAc",
    "SELECT 1 FROM pg_database WHERE datname='lawmate'",
  ], { encoding: "utf-8", env: { ...process.env, PGPASSWORD: pgSuperuserPassword } });

  if (check.stdout?.trim() === "1") return;

  const exe = path.join(postgresBinDir, "createdb.exe");
  const result = spawnSync(exe, ["-h", "127.0.0.1", "-p", String(ports.postgres), "-U", "postgres", "lawmate"], {
    encoding: "utf-8",
    env: { ...process.env, PGPASSWORD: pgSuperuserPassword },
  });
  if (result.status !== 0) {
    throw new Error(`createdb failed:\n${result.stdout}\n${result.stderr}`);
  }
}
