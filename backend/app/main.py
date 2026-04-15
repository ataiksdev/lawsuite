import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings

# ─── Auth Environment ────────────────────────────────────────────────────────
# Allow non-HTTPS for OAuthlib (required for local Google OAuth flow)
if settings.is_development:
    os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(
    title="LegalOps API",
    version="0.1.0",
    docs_url="/docs" if settings.is_development else None,
    redoc_url="/redoc" if settings.is_development else None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Health ───────────────────────────────────────────────────────────────────


@app.get("/health", tags=["system"])
async def health():
    return {"status": "ok", "env": settings.app_env}


# ─── Routers ──────────────────────────────────────────────────────────────────

from app.api import (
    admin,
    auth,
    billing,
    calendar,
    clients,
    documents,
    integrations,
    matters,
    notes,
    notifications,
    reports,
    search,
    tasks,
    webhooks,
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(clients.router, prefix="/clients", tags=["clients"])
app.include_router(matters.router, prefix="/matters", tags=["matters"])

# Tasks are mounted under /matters (nested routes) AND /tasks (overdue endpoint)
app.include_router(tasks.router, prefix="/matters", tags=["tasks"])
app.include_router(tasks.router, prefix="/tasks", tags=["tasks"], include_in_schema=False)
app.include_router(calendar.router, prefix="/calendar", tags=["calendar"])
app.include_router(documents.router, prefix="/matters", tags=["documents"])
app.include_router(integrations.router, prefix="/integrations", tags=["integrations"])
app.include_router(webhooks.router, prefix="/webhooks", tags=["webhooks"])
app.include_router(reports.router, prefix="/reports", tags=["reports"])
app.include_router(billing.router, prefix="/billing", tags=["billing"])
app.include_router(admin.router, prefix="/admin", tags=["admin"])
app.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
app.include_router(notes.router, prefix="/notes", tags=["notes"])
app.include_router(search.router, prefix="/search", tags=["search"])
