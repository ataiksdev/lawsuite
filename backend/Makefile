.PHONY: install dev worker beat test test-e2e test-e2e-headed lint format typecheck migrate migrate-auto migrate-down db-create db-drop seed

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
	ruff check app tests e2e

format:
	ruff format app tests e2e

typecheck:
	mypy app

# ─── Tests ────────────────────────────────────────────────────────────────────

test:
	pytest -v tests

test-cov:
	pytest -v tests --cov=app --cov-report=html

test-e2e:
	python -m poetry run pytest -v e2e --base-url http://localhost:3000 --browser chromium --browser-channel chrome

test-e2e-headed:
	python -m poetry run pytest -v e2e --base-url http://localhost:3000 --browser chromium --browser-channel chrome --headed

# ─── Helpers ─────────────────────────────────────────────────────────────────

check: lint typecheck test
	@echo "All checks passed"
