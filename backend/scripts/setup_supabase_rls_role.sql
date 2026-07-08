-- Production (Supabase) equivalent of scripts/setup_local_rls_role.sql.
-- Run this in the Supabase SQL Editor (or via `psql` against your project's
-- connection string) BEFORE changing the app's DATABASE_URL in Railway/Vercel.
--
-- ── Step 0: check what you're currently connecting as ────────────────────
-- Run this first. If `rolsuper` or `rolbypassrls` is true for the role your
-- app currently uses, RLS policies are silently doing nothing today —
-- which is the same gap this migration closes locally.
--
--   SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user;
--   SELECT tableowner FROM pg_tables WHERE tablename = 'clients';
--
-- If tableowner is also your app's current role, you additionally need the
-- `FORCE ROW LEVEL SECURITY` statements below (table owners bypass RLS
-- unless forced) -- they're included either way, it's a harmless no-op
-- otherwise.

-- ── Step 1: create the restricted app role ────────────────────────────────
-- CHANGE THIS PASSWORD before running -- do not reuse the local dev one.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'legalops_app') THEN
    CREATE ROLE legalops_app LOGIN PASSWORD 'REPLACE_WITH_A_GENERATED_SECRET'
      NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

GRANT CONNECT ON DATABASE postgres TO legalops_app;   -- adjust db name if not "postgres"
GRANT USAGE ON SCHEMA public TO legalops_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO legalops_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO legalops_app;

-- So future `alembic upgrade` runs (still as the owner/admin role) keep
-- extending privileges to new tables/sequences automatically.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO legalops_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO legalops_app;

-- ── Step 2: enable + force RLS and (re)create the tenant_isolation policies ──
-- Identical to app/models/rls.py's RLS_STATEMENTS -- keep these two in sync
-- if you ever add another tenant-scoped table.

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients FORCE ROW LEVEL SECURITY;
ALTER TABLE matters ENABLE ROW LEVEL SECURITY;
ALTER TABLE matters FORCE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks FORCE ROW LEVEL SECURITY;
ALTER TABLE matter_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE matter_documents FORCE ROW LEVEL SECURITY;
ALTER TABLE matter_document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE matter_document_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE matter_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE matter_emails FORCE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE organisation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisation_members FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON clients;
CREATE POLICY tenant_isolation ON clients
    USING (current_setting('app.bypass_rls', true) = 'on'
           OR organisation_id::text = current_setting('app.current_org_id', true));

DROP POLICY IF EXISTS tenant_isolation ON matters;
CREATE POLICY tenant_isolation ON matters
    USING (current_setting('app.bypass_rls', true) = 'on'
           OR organisation_id::text = current_setting('app.current_org_id', true));

DROP POLICY IF EXISTS tenant_isolation ON tasks;
CREATE POLICY tenant_isolation ON tasks
    USING (current_setting('app.bypass_rls', true) = 'on'
           OR organisation_id::text = current_setting('app.current_org_id', true));

DROP POLICY IF EXISTS tenant_isolation ON matter_documents;
CREATE POLICY tenant_isolation ON matter_documents
    USING (current_setting('app.bypass_rls', true) = 'on'
           OR organisation_id::text = current_setting('app.current_org_id', true));

DROP POLICY IF EXISTS tenant_isolation ON matter_document_versions;
CREATE POLICY tenant_isolation ON matter_document_versions
    USING (
        current_setting('app.bypass_rls', true) = 'on'
        OR EXISTS (
            SELECT 1 FROM matter_documents
            WHERE matter_documents.id = matter_document_versions.document_id
            AND matter_documents.organisation_id::text = current_setting('app.current_org_id', true)
        )
    );

DROP POLICY IF EXISTS tenant_isolation ON matter_emails;
CREATE POLICY tenant_isolation ON matter_emails
    USING (current_setting('app.bypass_rls', true) = 'on'
           OR organisation_id::text = current_setting('app.current_org_id', true));

DROP POLICY IF EXISTS tenant_isolation ON activity_logs;
CREATE POLICY tenant_isolation ON activity_logs
    USING (current_setting('app.bypass_rls', true) = 'on'
           OR organisation_id::text = current_setting('app.current_org_id', true));

DROP POLICY IF EXISTS tenant_isolation ON organisation_members;
CREATE POLICY tenant_isolation ON organisation_members
    USING (current_setting('app.bypass_rls', true) = 'on'
           OR organisation_id::text = current_setting('app.current_org_id', true));

-- ── Step 3: after this runs cleanly ───────────────────────────────────────
-- 1. Update Railway's DATABASE_URL (async, app runtime) to use legalops_app.
-- 2. Leave DATABASE_URL_SYNC pointed at the admin/owner role -- Alembic
--    needs DDL rights this restricted role intentionally doesn't have.
-- 3. Redeploy api/worker/beat services together (all three read DATABASE_URL).
-- 4. Smoke-test: log in as two different orgs and confirm each only sees
--    its own matters/clients/tasks/documents before calling this done.
