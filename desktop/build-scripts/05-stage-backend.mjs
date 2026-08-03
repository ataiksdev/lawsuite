// Stages the backend as plain source files (app/, alembic/, alembic.ini) —
// no freezing. Deliberately excludes tests/, scripts/ (dev-only, includes
// the demo-data seed.py which must never run against a real client's DB),
// and anything not needed to run `alembic upgrade head` + `uvicorn`.
import path from "node:path";
import { backendDir, resourcesDir, ensureCleanDir, copyDir } from "./util.mjs";

console.log("== Staging backend source ==");

const stageDir = path.join(resourcesDir, "backend");
ensureCleanDir(stageDir);

const skip = (src) => {
  const base = path.basename(src);
  return base === "__pycache__" || base.endsWith(".pyc") || base === ".pytest_cache";
};

copyDir(path.join(backendDir, "app"), path.join(stageDir, "app"), (src) => !skip(src));
copyDir(path.join(backendDir, "alembic"), path.join(stageDir, "alembic"), (src) => !skip(src));
copyDir(path.join(backendDir, "alembic.ini"), path.join(stageDir, "alembic.ini"));

console.log("== Backend source staged ==");
