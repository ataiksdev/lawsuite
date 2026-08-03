// Stages a standalone node.exe used purely to run the Next.js `output:
// "standalone"` server bundle (server.js) as its own isolated child
// process — kept separate from Electron's own bundled Node so a frontend
// server crash can never touch Electron's main process/event loop.
import path from "node:path";
import { existsSync, copyFileSync } from "node:fs";
import { resourcesDir, cacheDir, ensureCleanDir, downloadCached, extractZip } from "./util.mjs";

const NODE_VERSION = "22.13.1";
const NODE_ZIP_URL = `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip`;

async function main() {
  console.log("== Staging Node runtime ==");

  const zipPath = await downloadCached(
    NODE_ZIP_URL,
    path.join(cacheDir, `node-v${NODE_VERSION}-win-x64.zip`)
  );

  const extractDir = path.join(cacheDir, "node-extracted");
  extractZip(zipPath, extractDir);

  const nodeExeSrc = path.join(extractDir, `node-v${NODE_VERSION}-win-x64`, "node.exe");
  if (!existsSync(nodeExeSrc)) {
    throw new Error(`Expected ${nodeExeSrc} — did the node.org zip layout change?`);
  }

  const nodeDir = path.join(resourcesDir, "node");
  ensureCleanDir(nodeDir);
  copyFileSync(nodeExeSrc, path.join(nodeDir, "node.exe"));

  console.log("== Node runtime staged ==");
}

main();
