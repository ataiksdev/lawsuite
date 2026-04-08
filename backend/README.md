# LegalOps — Backend API

FastAPI + PostgreSQL + Redis. Nigerian legal practice management SaaS.

---

## Stack

| Layer | Technology |
|---|---|
| API | FastAPI 0.111, Python 3.11 |
| Database | PostgreSQL 15 + SQLAlchemy async |
| Migrations | Alembic |
| Cache / Queue | Redis + Celery |
| Auth | JWT (python-jose) + bcrypt |
| MFA | TOTP via pyotp (RFC 6238) |
| Google OAuth | Sign-in + Workspace (Drive, Docs, Gmail) |
| Billing | Paystack (pypaystack2) |
| Tests | pytest-asyncio, 131 tests |
## Tech stack

- **FastAPI** — async Python web framework
- **SQLAlchemy 2 (async)** — ORM with asyncpg driver
- **Alembic** — database migrations
- **Celery + Redis** — background jobs and scheduled tasks
- **Postgres 16** — primary database
- **Poetry** — dependency management

---

## Local setup (no Docker)

### 1. Prerequisites

**Python 3.11** via pyenv (recommended):
```bash
brew install pyenv
pyenv install 3.11.9
pyenv local 3.11.9
```

**Poetry**:
```bash
curl -sSL https://install.python-poetry.org | python3 -
```

**PostgreSQL 16**:
```bash
brew install postgresql@16   # macOS
brew services start postgresql@16
# Ubuntu: sudo apt install postgresql && sudo systemctl start postgresql
```

**Redis**:
```bash
brew install redis           # macOS
brew services start redis
# Ubuntu: sudo apt install redis-server && sudo systemctl start redis
```

---

### 2. Install dependencies

```bash
cd backend
poetry install
```
---

## Quick start

### 1. Prerequisites

```bash
# PostgreSQL 15+
createdb legalops
createdb legalops_test

# Redis
redis-server
```

### 2. Install

```bash
cd backend
poetry install
```

### 3. Configure

```bash
cp .env.example .env
# Edit .env — minimum required:
#   DATABASE_URL
#   DATABASE_URL_SYNC
#   JWT_SECRET          (generate: python -c "import secrets; print(secrets.token_hex(32))")
#   ENCRYPTION_KEY      (generate: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
```

### 4. Migrate + seed

```bash
make migrate       # runs Alembic migrations 0001 → 0002
make seed          # creates demo data, prints PLATFORM_ADMIN_ORG_ID
# → Copy the printed org ID into .env as PLATFORM_ADMIN_ORG_ID
```

### 5. Run

```bash
make dev           # API on http://localhost:8000
make worker        # Celery worker (separate terminal)
make beat          # Celery beat scheduler (separate terminal)
```

---

## Google OAuth setup

Two separate redirect URIs — add both in Google Cloud Console → Credentials:

| Purpose | Redirect URI |
|---|---|
| **Sign in with Google** (user identity) | `http://localhost:8000/auth/google/callback` |
| **Workspace integration** (Drive/Gmail) | `http://localhost:8000/integrations/google/callback` |

Required scopes per flow:

- **Sign-in:** `openid email profile`
- **Workspace:** `drive drive.activity.readonly gmail.readonly gmail.send docs`

---

## Authentication flows

### Email/password login (with MFA)

```
POST /auth/register          → creates org + 30-day trial, returns tokens
POST /auth/login             → {mfa_required: false, access_token, ...}
                               OR {mfa_required: true, mfa_token}
POST /auth/mfa/validate      → (if mfa_required) submit mfa_token + TOTP code → tokens
POST /auth/refresh           → exchange refresh token for new pair
```

### Sign in with Google

```
GET  /auth/google/login               → redirects to Google consent
GET  /auth/google/callback            → exchanges code
                                        → existing user: redirects to /login?tokens=<b64>
                                        → new user:      redirects to /onboarding?provisional=<token>
POST /auth/google/complete-signup     → new user submits org name → full tokens + org
```

### MFA setup (optional, any role)

```
POST /auth/mfa/setup                     → returns QR code SVG + secret
POST /auth/mfa/verify         {code}     → activates MFA, returns 8 backup codes
POST /auth/mfa/disable        {code}     → requires TOTP confirmation
POST /auth/mfa/backup-codes/regenerate   → invalidates old codes
GET  /auth/mfa/status                    → {mfa_enabled, backup_codes_remaining}
```

---

## Billing + trial + feature flags

Every new org gets **30 days of full Pro-equivalent access** automatically.

Plan resolution order (highest priority first):
1. Per-org **feature flag overrides** (platform admin can toggle individual flags)
2. Active **trial** (if within 30-day window and not yet used)
3. **Paid plan** (free / pro / agency)

| Plan | Price | Matters | Seats | Drive | Reports | API |
|---|---|---|---|---|---|---|
| Free | ₦0 | 5 | 1 | ✗ | ✗ | ✗ |
| Trial | ₦0 (30 days) | ∞ | 5 | ✓ | ✓ | ✗ |
| Pro | ₦29,000/mo | ∞ | 5 | ✓ | ✓ | ✗ |
| Agency | ₦79,000/mo | ∞ | ∞ | ✓ | ✓ | ✓ |

Platform admin controls:
```
POST  /admin/organisations/{id}/plan             → override plan
PATCH /admin/organisations/{id}/features         → toggle individual flags
POST  /admin/organisations/{id}/extend-trial     → extend/reset trial window
```

---

## Platform admin setup

After running `make seed`:

```bash
# .env
PLATFORM_ADMIN_ORG_ID=<uuid printed by seed>
```

This unlocks `/admin/*` routes for your account:

```
GET  /admin/stats
GET  /admin/organisations
GET  /admin/organisations/{id}
GET  /admin/organisations/{id}/subscription
POST /admin/organisations/{id}/plan
PATCH /admin/organisations/{id}/features
POST /admin/organisations/{id}/extend-trial
POST /admin/organisations/{id}/deactivate
POST /admin/organisations/{id}/activate
```

---

## Testing

```bash
make test                                    # all 131 tests
make test-file f=tests/api/test_auth.py     # single file
make test-cov                               # with coverage report
```

Test database: `legalops_test` (created automatically, truncated between tests).

---

## Makefile targets

```
make dev            start API server (reload)
make worker         start Celery worker
make beat           start Celery beat scheduler
make migrate        apply all pending migrations
make migrate-auto   generate migration from model changes
make migrate-down   roll back last migration
make migrate-status show current migration
make seed           create demo data
make test           run all tests
make test-cov       tests with coverage
make format         ruff format
make lint           ruff check
```

---

## API docs

Available at `http://localhost:8000/docs` in development mode.
Disabled in production (set `APP_ENV=production`).
