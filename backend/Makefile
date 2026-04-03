.PHONY: install dev worker beat test lint format typecheck migrate migrate-auto migrate-down db-create db-drop seed

# ─── Setup ────────────────────────────────────────────────────────────────────

install:
	pip install -e .

# ─── Run ──────────────────────────────────────────────────────────────────────

dev:
	uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

worker:
	celery -A app.workers.celery_app worker --loglevel=info

beat:
	celery -A app.workers.celery_app beat --loglevel=info

# ─── Database ────────────────────────────────────────────────────────────────

db-create:
	createdb legalops

db-drop:
	dropdb legalops

migrate:
	alembic upgrade head

migrate-down:
	alembic downgrade -1

# Usage: make migrate-auto msg="add user table"
migrate-auto:
	alembic revision --autogenerate -m "$(msg)"

migrate-history:
	alembic history --verbose

seed:
	python -m scripts.seed

rls:
	python -m app.models.rls

# ─── Quality ─────────────────────────────────────────────────────────────────

lint:
	ruff check app tests

format:
	ruff format app tests

typecheck:
	mypy app

# ─── Tests ────────────────────────────────────────────────────────────────────

test:
	pytest -v

test-cov:
	pytest -v --cov=app --cov-report=html

# ─── Helpers ─────────────────────────────────────────────────────────────────

check: lint typecheck test
	@echo "All checks passed"
