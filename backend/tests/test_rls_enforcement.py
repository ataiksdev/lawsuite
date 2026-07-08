# backend/tests/test_rls_enforcement.py
"""
Verifies that Postgres Row Level Security actually blocks cross-org access
when connecting as the app's real least-privilege role (`legalops`), as
opposed to test_*_isolation tests elsewhere in this suite, which only prove
the app-level `WHERE organisation_id = ...` filters work.

Why this file exists: conftest.py's `client`/`db_session` fixtures connect
as the Postgres *admin* role (see TEST_DATABASE_URL) so they can freely
drop/create the schema per test. Superusers bypass RLS unconditionally, so
routes exercised through the `client` fixture never actually test whether
RLS itself would catch a missing organisation_id filter -- only whether the
service code remembered to include one. If a future change accidentally
drops a `.where(Model.organisation_id == org_id)` clause, every test in
this suite would still pass except the ones here.

These tests open a SEPARATE connection as the `legalops` role (the one the
real app connects as -- see app/core/database.py) against the same
legalops_test database, and drive raw SQL directly against it, mirroring
exactly what app/core/deps.get_scoped_db does.
"""
import uuid

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.models.rls import RLS_STATEMENTS
from tests.conftest import TEST_DATABASE_URL, _admin_url

APP_ROLE = make_url(settings.database_url).username  # "legalops" locally

# The legalops role connecting to the *_test database, mirroring production
# shape (same role, different database) rather than a third set of creds.
_RLS_TEST_URL = make_url(settings.database_url).set(
    database=make_url(TEST_DATABASE_URL).database
).render_as_string(hide_password=False)


@pytest_asyncio.fixture
async def rls_conn():
    """
    Fresh schema + RLS policies (admin role), then a real connection as the
    app's actual restricted role for the test body to drive directly.
    """
    admin_engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
    async with admin_engine.begin() as conn:
        from app.core.database import Base

        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

        # Re-grant on every run: cheap, idempotent, and survives a fresh
        # `legalops_test` database that's never had this role granted on it.
        await conn.execute(text(f'GRANT CONNECT ON DATABASE {_admin_url.database}_test TO {APP_ROLE}'))
        await conn.execute(text(f"GRANT USAGE ON SCHEMA public TO {APP_ROLE}"))
        await conn.execute(text(f"GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO {APP_ROLE}"))
        await conn.execute(text(f"GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO {APP_ROLE}"))

        # drop_all/create_all destroys any previously-attached policies along
        # with the tables, so this has to be re-applied after every reset.
        # asyncpg can't run a multi-statement string in one prepared
        # statement (unlike the psycopg2 path rls.py's __main__ block uses),
        # so split and run each statement individually.
        for statement in RLS_STATEMENTS.split(";"):
            statement = statement.strip()
            if statement:
                await conn.execute(text(statement))
    await admin_engine.dispose()

    app_engine = create_async_engine(_RLS_TEST_URL, poolclass=NullPool)
    async with app_engine.connect() as conn:
        yield conn
    await app_engine.dispose()


async def _seed_two_orgs(conn):
    """Insert one org + one client each for two separate tenants, via the
    bypass flag -- exactly how a platform-admin/migration path would."""
    org_a, org_b = uuid.uuid4(), uuid.uuid4()
    client_a, client_b = uuid.uuid4(), uuid.uuid4()

    await conn.execute(text("SELECT set_config('app.bypass_rls', 'on', false)"))
    await conn.execute(text("""
        INSERT INTO organisations (id, name, slug, plan, is_active, trial_used, trial_ends_at, created_at, updated_at)
        VALUES (:id, 'Org A', :slug_a, 'free', true, false, now(), now(), now()),
               (:id_b, 'Org B', :slug_b, 'free', true, false, now(), now(), now())
    """), {"id": org_a, "slug_a": f"org-a-{org_a.hex[:8]}", "id_b": org_b, "slug_b": f"org-b-{org_b.hex[:8]}"})
    await conn.execute(text("""
        INSERT INTO clients (id, organisation_id, name, is_active, created_at, updated_at)
        VALUES (:cid, :org_id, :name, true, now(), now())
    """), {"cid": client_a, "org_id": org_a, "name": "Client A"})
    await conn.execute(text("""
        INSERT INTO clients (id, organisation_id, name, is_active, created_at, updated_at)
        VALUES (:cid, :org_id, :name, true, now(), now())
    """), {"cid": client_b, "org_id": org_b, "name": "Client B"})
    await conn.commit()
    return org_a, org_b, client_a, client_b


async def _scope_to(conn, org_id):
    await conn.execute(text("SELECT set_config('app.bypass_rls', 'off', false)"))
    await conn.execute(text("SELECT set_config('app.current_org_id', :org_id, false)"), {"org_id": str(org_id)})


@pytest.mark.asyncio
async def test_no_context_sees_nothing(rls_conn):
    """Fail-closed default: with no org scoped and bypass off, zero rows."""
    org_a, org_b, *_ = await _seed_two_orgs(rls_conn)
    await _scope_to(rls_conn, uuid.uuid4())  # scoped to an org that owns nothing
    result = await rls_conn.execute(text("SELECT count(*) FROM clients"))
    assert result.scalar() == 0


@pytest.mark.asyncio
async def test_scoped_session_only_sees_its_own_org(rls_conn):
    org_a, org_b, client_a, client_b = await _seed_two_orgs(rls_conn)

    await _scope_to(rls_conn, org_a)
    result = await rls_conn.execute(text("SELECT id FROM clients"))
    visible_ids = {row[0] for row in result.fetchall()}
    assert visible_ids == {client_a}

    await _scope_to(rls_conn, org_b)
    result = await rls_conn.execute(text("SELECT id FROM clients"))
    visible_ids = {row[0] for row in result.fetchall()}
    assert visible_ids == {client_b}


@pytest.mark.asyncio
async def test_cross_org_update_affects_zero_rows(rls_conn):
    org_a, org_b, client_a, client_b = await _seed_two_orgs(rls_conn)

    await _scope_to(rls_conn, org_a)
    result = await rls_conn.execute(
        text("UPDATE clients SET name = 'renamed' WHERE id = :cid"), {"cid": client_b}
    )
    assert result.rowcount == 0
    await rls_conn.rollback()


@pytest.mark.asyncio
async def test_insert_with_spoofed_org_id_is_rejected(rls_conn):
    org_a, org_b, *_ = await _seed_two_orgs(rls_conn)

    await _scope_to(rls_conn, org_a)
    with pytest.raises(Exception, match="row-level security"):
        await rls_conn.execute(text("""
            INSERT INTO clients (id, organisation_id, name, is_active, created_at, updated_at)
            VALUES (gen_random_uuid(), :spoofed_org, 'spoofed', true, now(), now())
        """), {"spoofed_org": org_b})
    await rls_conn.rollback()


@pytest.mark.asyncio
async def test_bypass_flag_sees_all_orgs(rls_conn):
    """The platform-admin / webhook / worker escape hatch still works."""
    await _seed_two_orgs(rls_conn)
    await rls_conn.execute(text("SELECT set_config('app.bypass_rls', 'on', false)"))
    result = await rls_conn.execute(text("SELECT count(*) FROM clients"))
    assert result.scalar() == 2
