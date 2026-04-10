# LegalOps — Deployment Guide

## Architecture

```
GitHub (main) ──push──► GitHub Actions
                              │
                    ┌─────────┴──────────┐
                    ▼                    ▼
              Railway (backend)    Vercel (frontend)
              ├── api service      └── Next.js app
              ├── worker service
              └── beat service
                    │
              ┌─────┴──────┐
              ▼            ▼
           Postgres      Redis
          (Railway)    (Railway)
```

---

## Step 1 — Backend: Railway

### 1.1 Create project
```bash
npm install -g @railway/cli
railway login
railway init        # in repo root, name it "legalops"
```

### 1.2 Add plugins
In Railway dashboard → your project:
- **Add Plugin → PostgreSQL** → copy `DATABASE_URL` and `DATABASE_URL_SYNC` (replace `postgresql://` with `postgresql+asyncpg://` for the async one)
- **Add Plugin → Redis** → copy `REDIS_URL`

### 1.3 Create three services
In Railway dashboard, create three services all pointing to the same GitHub repo:

| Service name | Start command |
|---|---|
| `api`    | `uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 2` |
| `worker` | `celery -A app.workers.celery_app worker --loglevel=info --concurrency=2` |
| `beat`   | `celery -A app.workers.celery_app beat --loglevel=info` |

Set **Root Directory = `backend`** for all three services.

Set the `api` service **Release Command** to: `alembic upgrade head`

### 1.4 Set env vars (all three services share these)

```
DATABASE_URL=postgresql+asyncpg://...     # from Railway Postgres plugin
DATABASE_URL_SYNC=postgresql://...        # from Railway Postgres plugin
REDIS_URL=redis://...                     # from Railway Redis plugin

JWT_SECRET=<generate: python -c "import secrets; print(secrets.token_hex(32))">
ENCRYPTION_KEY=<generate: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())">
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=30

GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://your-api.up.railway.app/integrations/google/callback
GOOGLE_SIGNIN_REDIRECT_URI=https://your-api.up.railway.app/auth/google/callback

PAYSTACK_SECRET_KEY=sk_live_...
PAYSTACK_PUBLIC_KEY=pk_live_...
PAYSTACK_FREE_PLAN_CODE=PLN_...
PAYSTACK_PRO_PLAN_CODE=PLN_...
PAYSTACK_AGENCY_PLAN_CODE=PLN_...

APP_ENV=production
FRONTEND_URL=https://your-app.vercel.app
CORS_ORIGINS=["https://your-app.vercel.app"]

PLATFORM_ADMIN_ORG_ID=<your org UUID — run seed script first>
TRIAL_DAYS=30
```

### 1.5 Get service IDs for GitHub Actions
```bash
railway status --json   # note the serviceId for api, worker, beat
```

---

## Step 2 — Frontend: Vercel

### 2.1 Link project
```bash
cd frontend
npm install -g vercel
vercel link    # creates .vercel/project.json — commit this
```

### 2.2 Set env vars in Vercel dashboard
```
NEXT_PUBLIC_API_URL=https://your-api.up.railway.app
NEXT_PUBLIC_PLATFORM_ADMIN_ORG_ID=<same UUID as PLATFORM_ADMIN_ORG_ID above>
```

### 2.3 Vercel project settings
- Framework: **Next.js**
- Root directory: **frontend**
- Build command: `next build`
- Output: `.next`

---

## Step 3 — GitHub Actions secrets

Add these in GitHub → Settings → Secrets and variables → Actions:

| Secret | Where to get it |
|---|---|
| `RAILWAY_TOKEN` | railway.app → Account Settings → Tokens |
| `RAILWAY_SERVICE_API` | `railway status --json` service ID |
| `RAILWAY_SERVICE_WORKER` | same |
| `RAILWAY_SERVICE_BEAT` | same |
| `VERCEL_TOKEN` | vercel.com → Settings → Tokens |
| `VERCEL_ORG_ID` | vercel.com → Settings → General → Team ID |
| `VERCEL_PROJECT_ID` | `frontend/.vercel/project.json` → `projectId` |
| `CI_ENCRYPTION_KEY` | same value as `ENCRYPTION_KEY` in Railway |

---

## Step 4 — First deployment

```bash
# 1. Push to main
git push origin main

# 2. GitHub Actions runs: test → deploy-backend + deploy-frontend in parallel

# 3. After deploy, seed the platform admin org:
railway run --service api python -m scripts.seed
# Copy the PLATFORM_ADMIN_ORG_ID from output → set in Railway + Vercel env vars
```

---

## Step 5 — Paystack webhook URL

In Paystack dashboard → Settings → Webhooks:
```
https://your-api.up.railway.app/webhooks/paystack
```

In Google Cloud Console → OAuth 2.0 → Authorised redirect URIs, add:
```
https://your-api.up.railway.app/auth/google/callback
https://your-api.up.railway.app/integrations/google/callback
```

---

## Files to copy from Downloads

| File | Destination in repo |
|---|---|
| `Dockerfile` | `backend/Dockerfile` |
| `.dockerignore` | `backend/.dockerignore` |
| `railway.toml` | `railway.toml` (repo root) |
| `vercel.json` | `frontend/vercel.json` |
| `deploy.yml` | `.github/workflows/deploy.yml` |
| `matter-list-page.tsx` | `frontend/src/components/pages/matters/matter-list-page.tsx` |
| `client-list-page.tsx` | `frontend/src/components/pages/clients/client-list-page.tsx` |
