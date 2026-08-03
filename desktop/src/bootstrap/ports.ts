import { readFileSync } from "node:fs";
import path from "node:path";

// Packaged into the app.asar as `shared/ports.json` (see electron-builder.yml's
// `files` list) — this same file also drives NEXT_PUBLIC_API_URL at frontend
// build time (build-scripts/01-build-frontend.mjs), so the two never drift.
interface Ports {
  postgres: number;
  backend: number;
  frontend: number;
}

const portsPath = path.join(__dirname, "..", "..", "shared", "ports.json");
export const ports: Ports = JSON.parse(readFileSync(portsPath, "utf-8"));
