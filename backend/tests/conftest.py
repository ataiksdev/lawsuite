# backend/tests/conftest.py
from unittest.mock import patch

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

# Import models via separate namespace to prevent shadowing 'app' instance
from app import models as _models  # noqa: F401
from app.core.config import settings
from app.core.database import Base, get_db
from app.main import app as main_app


@pytest_asyncio.fixture(autouse=True)
def mock_resend():
    """Globally mock Resend to avoid API calls and errors in tests."""
    with patch("resend.Emails.send") as mock_send:
        yield mock_send

# Separate test database. Built from database_url_sync (the admin/owner role
# Alembic uses) rather than database_url (the app's least-privilege runtime
# role) because this fixture does a full drop_all/create_all per test --
# schema DDL that the restricted app role deliberately can't do under RLS.
from sqlalchemy.engine import make_url  # noqa: E402

_admin_url = make_url(settings.database_url_sync).set(drivername="postgresql+asyncpg")
TEST_DATABASE_URL = _admin_url.set(
    database=f"{_admin_url.database}_test"
).render_as_string(hide_password=False)


@pytest_asyncio.fixture
async def db_session() -> AsyncSession:
    """
    Provides a clean database and session per test.
    Using a fresh engine per test on Windows to avoid event loop conflicts.
    """
    engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool, echo=False)

    # Initialize DB for this test run
    async with engine.begin() as conn:
        # We drop/create every time to ensure absolute isolation on a fresh engine
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    #  async with engine.connect() as connection:
    session = AsyncSession(bind=engine, expire_on_commit=False)
    try:
        yield session
    finally:
        await session.close()
        await engine.dispose()


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncClient:
    """Provides an AsyncClient with the database session overriden."""

    async def override_get_db():
        yield db_session

    main_app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=main_app),
        base_url="http://test",
    ) as ac:
        yield ac

    main_app.dependency_overrides.clear()
