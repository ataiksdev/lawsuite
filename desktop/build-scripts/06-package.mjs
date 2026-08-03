// Full desktop build pipeline: stage all bundled resources, compile the
// Electron main-process TypeScript, then (unless --stage-only) invoke
// electron-builder to produce the Windows NSIS installer.
import { run, desktopDir } from "./util.mjs";

const stageOnly = process.argv.includes("--stage-only");

console.log("=== Lawmate desktop build ===");

run("node", ["build-scripts/01-build-frontend.mjs"], { cwd: desktopDir });
run("node", ["build-scripts/02-fetch-python-embed.mjs"], { cwd: desktopDir });
run("node", ["build-scripts/03-fetch-postgres.mjs"], { cwd: desktopDir });
run("node", ["build-scripts/04-fetch-node-runtime.mjs"], { cwd: desktopDir });
run("node", ["build-scripts/05-stage-backend.mjs"], { cwd: desktopDir });

console.log("== Compiling Electron main process ==");
run("npx", ["tsc", "-p", "tsconfig.json"], { cwd: desktopDir });

if (stageOnly) {
  console.log("=== Staging complete (--stage-only, skipping electron-builder) ===");
} else {
  console.log("== Running electron-builder ==");
  run("npx", ["electron-builder", "--win"], { cwd: desktopDir });
  console.log("=== Build complete — see desktop/dist/ ===");
}
