import { existsSync, mkdirSync, writeFileSync, unlinkSync, readFileSync } from "node:fs";
import path from "node:path";
import { postgresBinDir, pgDataDir, pgPasswordFile, logsDir } from "./paths";
import { ports } from "./ports";
import { runAsync } from "./proc";
import { logBootstrap } from "./logger";

async function pg(binary: string, args: string[], opts: { env?: NodeJS.ProcessEnv; ignoreStdio?: boolean } = {}): Promise<void> {
  const exe = path.join(postgresBinDir, binary);
  logBootstrap(`postgres: running ${binary} ${args.join(" ")}`);
  const result = await runAsync(exe, args, {
    env: opts.env ?? process.env,
    // "start" launches postgres.exe as a long-running background process
    // that can inherit piped stdout/stderr handles on Windows — Node then
    // waits for ALL processes sharing those pipes to close before firing
    // this call's own 'close' event, which never happens while postgres
    // keeps running for the rest of the app's lifetime. Postgres already
    // logs its own output to postgres.log via -l, so nothing is lost.
    stdio: opts.ignoreStdio ? "ignore" : undefined,
  });
  if (result.status !== 0) {
    throw new Error(
      `${binary} failed (exit ${result.status}):\n${result.stdout}\n${result.stderr}`
    );
  }
}

function isInitialized(): boolean {
  // initdb populates PG_VERSION as its last step — a reliable "did initdb
  // actually finish" marker, safer than just checking the directory exists
  // (which mkdirSync creates before initdb runs).
  return existsSync(path.join(pgDataDir, "PG_VERSION"));
}

export async function initPostgresIfNeeded(pgSuperuserPassword: string): Promise<void> {
  if (isInitialized()) {
    logBootstrap("postgres: data directory already initialized, skipping initdb");
    return;
  }

  mkdirSync(pgDataDir, { recursive: true });
  mkdirSync(logsDir, { recursive: true });

  writeFileSync(pgPasswordFile, pgSuperuserPassword, "utf-8");
  try {
    await pg("initdb.exe", [
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
  logBootstrap("postgres: initdb complete");
}

async function isAlreadyRunning(): Promise<boolean> {
  const result = await runAsync(path.join(postgresBinDir, "pg_isready.exe"), [
    "-h", "127.0.0.1", "-p", String(ports.postgres),
  ]);
  return result.status === 0;
}

export async function startPostgres(): Promise<void> {
  // A previous launch that crashed or was force-killed (Task Manager, a
  // Windows update forcing a reboot, ...) can leave its postgres.exe still
  // holding the port and data directory — pg_ctl start would then fail with
  // a misleading error instead of a clear "already running" one. Detect
  // that up front and just reuse the existing instance instead of treating
  // it as a startup failure.
  if (await isAlreadyRunning()) {
    logBootstrap("postgres: already running (reusing existing instance)");
    return;
  }

  await pg("pg_ctl.exe", [
    "-D",
    pgDataDir,
    "-l",
    path.join(logsDir, "postgres.log"),
    "-w",
    "start",
  ], { ignoreStdio: true });
  logBootstrap("postgres: started, accepting connections");
}

export async function stopPostgres(): Promise<void> {
  if (!isInitialized()) return;
  try {
    await pg("pg_ctl.exe", ["-D", pgDataDir, "-m", "fast", "stop"]);
  } catch (err) {
    // Best-effort on shutdown — don't block app quit over this.
    console.error("[postgres] stop failed:", err);
  }
}

export async function createAppDatabaseIfNeeded(pgSuperuserPassword: string): Promise<void> {
  const env = { ...process.env, PGPASSWORD: pgSuperuserPassword };

  logBootstrap("postgres: checking whether the lawmate database exists");
  const check = await runAsync(path.join(postgresBinDir, "psql.exe"), [
    "-h",
    "127.0.0.1",
    "-p",
    String(ports.postgres),
    "-U",
    "postgres",
    "-tAc",
    "SELECT 1 FROM pg_database WHERE datname='lawmate'",
  ], { env });

  if (check.stdout?.trim() === "1") {
    logBootstrap("postgres: lawmate database already exists");
    return;
  }

  logBootstrap("postgres: creating lawmate database");
  const result = await runAsync(path.join(postgresBinDir, "createdb.exe"), [
    "-h", "127.0.0.1", "-p", String(ports.postgres), "-U", "postgres", "lawmate",
  ], { env });
  if (result.status !== 0) {
    throw new Error(`createdb failed:\n${result.stdout}\n${result.stderr}`);
  }
  logBootstrap("postgres: lawmate database created");
}
