from contextlib import asynccontextmanager
from typing import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

engine = create_async_engine(
    settings.async_database_url,
    echo=False,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    pass


async def _reset_rls_bypass(session: AsyncSession) -> None:
    """
    Every session starts in bypass mode -- connections are pooled and reused,
    so we can't trust whatever a previous request left in these GUCs. Routes
    that need tenant scoping (see deps.get_scoped_db) narrow it explicitly.
    Requires the app's DB role to NOT be a superuser/table owner -- see
    scripts/setup_local_rls_role.sql.
    """
    await session.execute(text("SELECT set_config('app.bypass_rls', 'on', false)"))


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Binds the Session to a single checked-out Connection for the whole
    request instead of the Engine/pool. The RLS GUCs set via _reset_rls_bypass
    (and get_scoped_db) are connection-scoped (set_config(..., is_local=false)),
    so if the Session were pool-bound, a commit() mid-request could release
    the physical connection back to the pool and a later statement on the
    same session could silently pick up a *different* connection carrying
    another request's stale GUCs -- causing RLS to hide rows that were just
    written (e.g. `Could not refresh instance`). Pinning one connection per
    request keeps the GUCs valid for the request's full lifetime.
    """
    async with engine.connect() as conn:
        async with AsyncSessionLocal(bind=conn) as session:
            try:
                await _reset_rls_bypass(session)
                yield session
            except Exception:
                await session.rollback()
                raise
            finally:
                await session.close()


@asynccontextmanager
async def worker_session() -> AsyncGenerator[AsyncSession, None]:
    """
    Session factory for Celery tasks (which don't go through FastAPI's
    dependency graph). Defaults to RLS-bypass since background jobs
    typically operate across orgs or use their own explicit filters.
    Pinned to a single connection for the same reason as get_db.
    """
    async with engine.connect() as conn:
        async with AsyncSessionLocal(bind=conn) as session:
            try:
                await _reset_rls_bypass(session)
                yield session
            except Exception:
                await session.rollback()
                raise
            finally:
                await session.close()
