# LegalOps — Backend API

FastAPI backend for the LegalOps SaaS platform. Manages matters, clients, tasks, documents, Google Workspace integrations, and periodic reporting for legal consultants.

---

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

### 3. Create databases

```bash
make db-create
createdb legalops_test      # for running tests
```

### 4. Configure environment

```bash
cp .env.example .env
```

Minimum required values to fill in:

| Variable | How to generate |
|---|---|
| `JWT_SECRET` | `python -c "import secrets; print(secrets.token_hex(32))"` |
| `ENCRYPTION_KEY` | `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `DATABASE_URL` | Update with your local Postgres password |
| `DATABASE_URL_SYNC` | Same but with psycopg2 prefix |

### 5. Run migrations and start

```bash
make migrate
make dev        # API at http://localhost:8000
make worker     # Celery worker (separate terminal)
```

---

## Commands

| Command | Description |
|---|---|
| `make dev` | Start API with hot reload |
| `make worker` | Start Celery worker |
| `make migrate` | Apply pending migrations |
| `make migrate-auto msg="..."` | Generate migration from model changes |
| `make migrate-down` | Roll back last migration |
| `make test` | Run test suite |
| `make lint` | Ruff linter |
| `make format` | Auto-format with ruff |
| `make typecheck` | mypy type check |
| `make seed` | Seed test data |

---

## Project structure

```
backend/
├── app/
│   ├── api/          # Route handlers
│   ├── core/         # Config, DB, security, deps
│   ├── models/       # SQLAlchemy models
│   ├── schemas/      # Pydantic schemas
│   ├── services/     # Business logic
│   └── workers/      # Celery tasks
├── alembic/          # Migrations
├── scripts/          # Seed and one-off scripts
├── tests/            # pytest suite
├── .env.example
├── alembic.ini
├── Makefile
└── pyproject.toml
```
