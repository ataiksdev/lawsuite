# LegalOps Backend — Makefile
# Usage: make <target>

.PHONY: dev worker beat migrate migrate-auto migrate-down test seed rls install format lint

# ─── Dev ──────────────────────────────────────────────────────────────────────

dev:
	uvicorn app.main:app --reload --port 8000

worker:
	celery -A app.workers.celery_app worker --loglevel=info

beat:
	celery -A app.workers.celery_app beat --loglevel=info

# ─── Database ─────────────────────────────────────────────────────────────────

# Apply all pending migrations
migrate:
	alembic upgrade head

# Auto-generate a new migration from model changes
# Usage: make migrate-auto msg="add some column"
migrate-auto:
	alembic revision --autogenerate -m "$(msg)"

# Roll back the last migration
migrate-down:
	alembic downgrade -1

# Show current migration state
migrate-status:
	alembic current

# ─── Testing ──────────────────────────────────────────────────────────────────

test:
	pytest tests/ -v --tb=short

test-cov:
	pytest tests/ -v --tb=short --cov=app --cov-report=term-missing

# Run a specific test file
# Usage: make test-file f=tests/api/test_auth.py
test-file:
	pytest $(f) -v --tb=short

# ─── Seed data ────────────────────────────────────────────────────────────────

seed:
	python scripts/seed.py

# ─── Row-level security ───────────────────────────────────────────────────────

rls:
	python -c "from app.models.rls import apply_rls_policies; import asyncio; asyncio.run(apply_rls_policies())"

# ─── Code quality ─────────────────────────────────────────────────────────────

format:
	ruff format app/ tests/

lint:
	ruff check app/ tests/

typecheck:
	mypy app/

# ─── Install ──────────────────────────────────────────────────────────────────

install:
	poetry install

install-prod:
	poetry install --only main
