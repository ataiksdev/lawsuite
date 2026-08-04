# Lawmate Desktop (Windows)

Packages the existing Lawmate web app (`frontend/` + `backend/`) into an
installable Windows desktop app. Each install runs entirely on the client's
own machine: its own local Postgres database, its own local backend — no
shared/cloud database, one firm per install. Firm logos are saved to disk
and served by the local backend itself (`LocalStorageService` — see
`backend/app/services/local_storage_service.py`), not Supabase Storage,
since there's no reason a single-tenant local install should depend on an
external cloud service for something this small. Only actual documents go
through Google Drive, and only when that org has connected it. Other cloud
integrations (Google Workspace, Paystack, Resend/SMTP email) stay available
but optional, exactly as they already behave for any org today — they just
need the client's own internet connection and credentials, entered via the
app's existing Settings screens.

This directory is self-contained: it does not change how `frontend/` or
`backend/` are built or deployed normally (Vercel/Render), and building it
requires nothing installed in those directories beyond their existing
`npm`/`poetry` setups.

## Prerequisites (build machine only — clients need nothing but the installer)

- Windows (the whole pipeline shells out to Windows-only tools: PowerShell's
  `Expand-Archive`, Windows Postgres/Python/Node binaries).
- Node.js 22+ and npm.
- Poetry, resolvable at `backend/.venv/Scripts/poetry.exe` (this project's
  convention — `poetry` isn't expected to be on the global PATH, matching
  how `pytest`/`alembic`/etc. are also only run from the activated backend
  venv) or on PATH as a fallback. `poetry export` is used to generate the
  dependency list for the bundled Python — no `poetry install` needed in
  `backend/` itself beyond having the venv already set up. **Poetry 2.x
  removed `export` as a built-in command** — if it fails with "The
  requested command export does not exist", run (with the backend venv
  activated) `poetry self add poetry-plugin-export` once first.
- Internet access on the build machine (downloads Postgres, Python, and
  Node runtime distributions on first build; cached under `.cache/`
  afterwards).

## Building

```
cd desktop
npm install
npm run dist
```

This runs the full pipeline: builds the frontend with the desktop env baked
in, stages an embeddable Python with backend dependencies installed into
it, stages Postgres and Node runtimes, stages the backend source, compiles
the Electron main process, then runs `electron-builder` to produce
`desktop/dist/Lawmate-Setup-<version>.exe`.

Run `npm run stage` instead to do everything except the final
`electron-builder` packaging step (useful for iterating on
`src/bootstrap/*.ts` — after staging once, `npm start` launches Electron
directly against the staged `resources/` without repackaging).

## How it works

On first launch, the Electron main process (`src/main.ts`):
1. Generates and persists (`%APPDATA%\lawmate-desktop\config\runtime.json`)
   a `JWT_SECRET`, a Fernet `ENCRYPTION_KEY`, and a random Postgres
   superuser password. These must never be regenerated after first run —
   `ENCRYPTION_KEY` in particular decrypts stored OAuth tokens; rotating it
   silently orphans any connected integration.
2. Runs `initdb` into `%APPDATA%\lawmate-desktop\pgdata`, starts Postgres
   via `pg_ctl`, creates the `lawmate` database.
3. Runs `alembic upgrade head`, then starts `uvicorn` — the same boot
   sequence `render.yaml` uses in production.
4. Starts the bundled Next.js standalone server.
5. Waits for both to answer health checks, then opens the app window.

On every later launch, steps 2-4 just start the already-initialized
Postgres/backend/frontend rather than re-initializing anything. On quit,
child processes are stopped in reverse order (frontend → backend →
Postgres) before Electron exits.

There's no custom first-run seeding — a client's first launch shows the
same registration/onboarding screen the hosted product already has
(`POST /auth/register`). `backend/scripts/seed.py` (demo data) is
deliberately excluded from the desktop bundle.

## GPU/sandbox flags (`src/main.ts`)

On some machines (VMs, restricted/managed environments, certain graphics
driver setups) Chromium's GPU process and/or sandboxed child processes fail
to initialize entirely — the app would otherwise crash within milliseconds
of launch with no visible error (`GPU process isn't usable. Goodbye.` /
`ERR_FAILED` loading the app window, visible only by launching the installed
`.exe` from a terminal instead of double-clicking, since Electron GUI apps
have no attached console otherwise). `main.ts` calls
`app.disableHardwareAcceleration()`, `--in-process-gpu`, and `--no-sandbox`
before `app.whenReady()` to work around this. Note `--no-sandbox` does
reduce Chromium's defense-in-depth against malicious web content — accepted
here because the app only ever loads its own bundled backend on localhost,
never arbitrary remote URLs.

## Known v1 limitations

- **No background jobs.** Celery/Redis (`backend/app/workers/`) aren't
  bundled — Redis has no clean Windows story. Scheduled email reminders,
  the weekly digest, and the overdue-invoice sweep don't run automatically
  in the desktop build. Everything else (matters, clients, tasks, invoices,
  documents, reports) works fully. This was a deliberate scope decision,
  not an oversight — revisit with an in-process scheduler if it's needed
  later.
- **No code signing.** The installer is unsigned, so Windows SmartScreen
  will show "Windows protected your PC" on first run — clients need to
  click "More info" → "Run anyway". Not a blocker for v1, just something to
  tell clients about up front.
- **No auto-update.** New versions require re-running the installer over
  the existing install (NSIS upgrades in place); there's no background
  update check.
- **No custom icon yet** — `electron-builder.yml` doesn't reference
  `build/icon.ico` because one doesn't exist. Add a real `.ico` and wire it
  in before distributing to real clients.
- **Google OAuth credentials and redirect URIs**: `GOOGLE_CLIENT_ID`/
  `GOOGLE_CLIENT_SECRET` come from an optional, gitignored
  `desktop/.env.desktop` file (two lines, `KEY=VALUE`) — staged into
  `resources/.env.desktop` at build time (see `05-stage-backend.mjs`) and
  read by `src/bootstrap/backend.ts`'s `loadDesktopEnvOverrides()`. Without
  that file, Google integration just stays unavailable, same as the hosted
  app's default. `GOOGLE_REDIRECT_URI`/`GOOGLE_SIGNIN_REDIRECT_URI` are
  always set to `http://127.0.0.1:8734/integrations/google/callback` and
  `http://127.0.0.1:8734/auth/google/callback` — these must be added as
  Authorized redirect URIs on that OAuth client in Google Cloud Console.
  One-time addition (the port is fixed across every desktop install), not
  per-client. **Real client distribution note**: this reuses one OAuth
  client's credentials across every install — fine for a developer's own
  builds, but shipping a real "Web application"-type client secret inside
  a binary handed to multiple law firms is a genuine exposure (anyone can
  extract it from `app.asar`). Revisit before distributing to actual
  clients — e.g. a "Desktop app" OAuth client type or a PKCE-only flow
  that doesn't require a secret at all.
- **No RLS role separation.** The backend connects as the Postgres
  superuser `initdb` creates, so Row-Level Security policies
  (`backend/app/models/rls.py`) are inert (Postgres bypasses RLS for
  superusers/table owners unconditionally). This is fine here — each
  install is single-tenant, so there's no cross-org data to isolate — but
  don't assume RLS is doing anything in this mode.
- **Fixed local ports** — Postgres `5433`, backend `8734`, frontend `4830`
  (`desktop/shared/ports.json`). No dynamic fallback in v1; if something
  else on the client's machine already holds one of these ports, the app
  will fail its startup health check.
