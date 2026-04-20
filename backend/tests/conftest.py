# backend/tests/conftest.py
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

# Import models via separate namespace to prevent shadowing 'app' instance
from app import models as _models  # noqa: F401
from app.core.config import settings
from app.core.database import Base, get_db
from app.main import app as main_app
from unittest.mock import MagicMock, patch

@pytest_asyncio.fixture(autouse=True)
def mock_resend():
    """Globally mock Resend to avoid API calls and errors in tests."""
    with patch("resend.Emails.send") as mock_send:
        yield mock_send

# Separate test database
TEST_DATABASE_URL = settings.database_url.replace("/legalops", "/legalops_test")


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
