// Stages a Windows "embeddable Python" distribution and pip-installs the
// backend's runtime dependencies into it. Deliberately NOT PyInstaller —
// see desktop/README.md for why (Jinja2 template loading + Alembic's
// dynamic migration imports don't play well with frozen single-exes).
import path from "node:path";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import {
  backendDir,
  resourcesDir,
  cacheDir,
  run,
  ensureCleanDir,
  downloadCached,
  extractZip,
} from "./util.mjs";

// This project's `poetry` isn't on the global PATH — it only exists inside
// backend/.venv (installed there as a dev dependency), same as
// pytest/alembic/etc. Prefer that, fall back to a global `poetry` if
// someone's set up differently.
const venvPoetry = path.join(backendDir, ".venv", "Scripts", "poetry.exe");
const poetryCmd = existsSync(venvPoetry) ? venvPoetry : "poetry";

const PYTHON_VERSION = "3.11.9";
const PYTHON_ZIP_URL = `https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-embed-amd64.zip`;
const GET_PIP_URL = "https://bootstrap.pypa.io/get-pip.py";

async function main() {
  console.log("== Staging embeddable Python ==");

  const pythonDir = path.join(resourcesDir, "python");
  ensureCleanDir(pythonDir);

  const zipPath = await downloadCached(
    PYTHON_ZIP_URL,
    path.join(cacheDir, `python-${PYTHON_VERSION}-embed-amd64.zip`)
  );
  extractZip(zipPath, pythonDir);

  // Embeddable distributions disable site-packages discovery by default —
  // pip-installed packages are invisible to the interpreter until this is
  // re-enabled in the generated ._pth file.
  const pthFile = path.join(pythonDir, "python311._pth");
  if (!existsSync(pthFile)) {
    throw new Error(`Expected ${pthFile} — did the embeddable zip layout change?`);
  }
  const pthContents = readFileSync(pthFile, "utf-8");
  writeFileSync(pthFile, pthContents.replace(/^#\s*import site/m, "import site"));

  const pythonExe = path.join(pythonDir, "python.exe");
  const getPipPath = await downloadCached(GET_PIP_URL, path.join(cacheDir, "get-pip.py"));
  run(pythonExe, [getPipPath, "--no-warn-script-location"]);

  // Exclude the `dev` dependency group (pytest, playwright, mypy, ruff, ...)
  // — this is the single biggest installer-size lever available.
  const requirementsPath = path.join(cacheDir, "requirements-desktop.txt");
  run(poetryCmd, [
    "export",
    "--without",
    "dev",
    "--no-interaction",
    "-f",
    "requirements.txt",
    "-o",
    requirementsPath,
  ], { cwd: backendDir });

  // pythonDir itself is wiped fresh every run (ensureCleanDir above), so
  // this never risks a stale/mismatched package — only the wheel *source*
  // changes. Letting pip use its own local wheel cache (the default;
  // --no-cache-dir was previously forcing every package to re-download on
  // every single build) is the equivalent here of the extraction caching
  // added for postgres/node.
  run(pythonExe, [
    "-m",
    "pip",
    "install",
    "--no-warn-script-location",
    "-r",
    requirementsPath,
  ]);

  console.log("== Embeddable Python staged ==");
}

main();
