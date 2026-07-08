-- Provisions a dedicated, non-superuser application role for local dev so
-- Row Level Security (app/models/rls.py) actually has teeth.
--
-- Why this is needed: Postgres superusers AND table owners bypass RLS
-- unconditionally, no matter how the policies are written. The local .env
-- previously pointed the app at the `postgres` superuser role directly,
-- which made every RLS policy a no-op.
--
-- Run this once, as the postgres superuser, against the local `legalops` db:
--   psql -U postgres -d legalops -f scripts/setup_local_rls_role.sql
--
-- For Supabase (production), run the equivalent statements against your
-- project's SQL editor using a role you create for the app (Supabase's own
-- `postgres` role is also a superuser-equivalent and will bypass RLS).

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'legalops') THEN
    CREATE ROLE legalops LOGIN PASSWORD 'legalops_dev_local' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

GRANT CONNECT ON DATABASE legalops TO legalops;
GRANT USAGE ON SCHEMA public TO legalops;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO legalops;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO legalops;

-- So future `alembic upgrade` runs (as postgres) keep extending the same
-- privileges to new tables/sequences without another manual grant step.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO legalops;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO legalops;
