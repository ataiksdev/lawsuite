// Builds the Next.js frontend with the desktop env baked in, then stages
// the `output: "standalone"` server bundle (which does NOT auto-include
// .next/static or public/ — both must be copied manually) into
// desktop/resources/frontend/standalone/.
import path from "node:path";
import { existsSync } from "node:fs";
import { frontendDir, resourcesDir, ports, run, ensureCleanDir, copyDir } from "./util.mjs";

console.log("== Building frontend (desktop variant) ==");

run("npm", ["run", "build"], {
  cwd: frontendDir,
  env: {
    ...process.env,
    NEXT_PUBLIC_API_URL: `http://127.0.0.1:${ports.backend}`,
    NEXT_PUBLIC_DESKTOP_BUILD: "1",
  },
});

const standaloneSrc = path.join(frontendDir, ".next", "standalone");
const staticSrc = path.join(frontendDir, ".next", "static");
const publicSrc = path.join(frontendDir, "public");

if (!existsSync(standaloneSrc)) {
  throw new Error(
    `Expected standalone output at ${standaloneSrc} — is "output: 'standalone'" still set in frontend/next.config.ts?`
  );
}

const stageDir = path.join(resourcesDir, "frontend", "standalone");
ensureCleanDir(path.join(resourcesDir, "frontend"));

console.log(`Staging standalone server -> ${stageDir}`);
copyDir(standaloneSrc, stageDir);

console.log("Staging .next/static (not auto-included by standalone mode)");
copyDir(staticSrc, path.join(stageDir, ".next", "static"));

console.log("Staging public/ (not auto-included by standalone mode)");
copyDir(publicSrc, path.join(stageDir, "public"));

console.log("== Frontend staged ==");
