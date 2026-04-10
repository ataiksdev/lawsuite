# =============================================================================
# LegalOps Backend — Multi-stage Dockerfile
# =============================================================================

# Stage 1: export deps with Poetry (keeps Poetry out of the final image)
FROM python:3.11-slim AS builder
WORKDIR /build
RUN pip install --no-cache-dir poetry==1.8.3
COPY pyproject.toml poetry.lock ./
RUN poetry export \
      --without dev \
      --no-interaction \
      --no-ansi \
      -f requirements.txt \
      -o requirements.txt

# Stage 2: lean runtime image, non-root user
FROM python:3.11-slim AS runtime

RUN groupadd --gid 1001 appgroup && \
    useradd  --uid 1001 --gid appgroup --shell /bin/bash --create-home appuser

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
      libpq5 \
      libjpeg62-turbo \
      libssl3 \
      curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /build/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY --chown=appuser:appgroup . .

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
