// Stages EnterpriseDB's official Windows "binaries" zip — a plain
// bin/lib/share archive with no installer and no admin rights required,
// suitable for embedding. Electron's main process manages initdb/pg_ctl
// against this at runtime (see src/bootstrap/postgres.ts).
//
// EDB's download page (https://www.enterprisedb.com/download-postgresql-binaries)
// serves these through an opaque `sbp.enterprisedb.com/getfile.jsp?fileid=`
// redirector that resolves to a stable, predictable direct URL of the form
// below. If this 404s in the future, look up the current fileid on that
// page and update PG_VERSION to match its resolved URL.
import path from "node:path";
import { resourcesDir, cacheDir, ensureCleanDir, downloadCached, extractZip } from "./util.mjs";

const PG_VERSION = "16.14-2";
const PG_ZIP_URL = `https://get.enterprisedb.com/postgresql/postgresql-${PG_VERSION}-windows-x64-binaries.zip`;

async function main() {
  console.log("== Staging Postgres binaries ==");

  const zipPath = await downloadCached(
    PG_ZIP_URL,
    path.join(cacheDir, `postgresql-${PG_VERSION}-windows-x64-binaries.zip`)
  );

  const extractDir = path.join(cacheDir, "postgres-extracted");
  extractZip(zipPath, extractDir);

  // The zip's top-level folder is "pgsql/" — flatten it directly into
  // resources/postgres/ so bootstrap code can reference postgres/bin/... .
  // Skip GUI/dev-only tooling the app never launches at copy time (not
  // just at electron-builder packaging time, where it's excluded again
  // as a backstop) — pgAdmin 4 alone is a whole separate bundled app,
  // and copying it on every build wastes disk and time for nothing.
  const pgDir = path.join(resourcesDir, "postgres");
  ensureCleanDir(pgDir);
  const { cpSync } = await import("node:fs");
  const srcRoot = path.join(extractDir, "pgsql");
  const PG_EXCLUDE = [
    "pgAdmin 4",
    "StackBuilder",
    "include",
    path.join("share", "locale"),
    path.join("share", "man"),
    "doc",
    "symbols",
  ];
  cpSync(srcRoot, pgDir, {
    recursive: true,
    filter: (source) => {
      const rel = path.relative(srcRoot, source);
      if (rel === "") return true;
      return !PG_EXCLUDE.some((prefix) => rel === prefix || rel.startsWith(prefix + path.sep));
    },
  });

  console.log("== Postgres binaries staged ==");
}

main();
