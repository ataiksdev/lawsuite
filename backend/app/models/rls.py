"""
Row Level Security helper.

Run this ONCE after the initial migration to add RLS policies
to all tenant-scoped tables.

Usage:
    poetry run python -m app.models.rls

RLS enforces that every query against a tenant table is automatically
filtered to the current organisation, even if app code forgets to filter.
The app sets the session variable via the database URL or a middleware step.

NOTE: For development simplicity, RLS is defined here as raw SQL
that can be run manually or as part of a post-migration script.
In production (Supabase), you can also set these in the Supabase dashboard.
"""

RLS_STATEMENTS = """
-- Enable RLS on all tenant-scoped tables
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE matters ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE matter_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE matter_document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE matter_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisation_members ENABLE ROW LEVEL SECURITY;

-- Policies: each row is visible only to the matching organisation
CREATE POLICY tenant_isolation ON clients
    USING (organisation_id::text = current_setting('app.current_org_id', true));

CREATE POLICY tenant_isolation ON matters
    USING (organisation_id::text = current_setting('app.current_org_id', true));

CREATE POLICY tenant_isolation ON tasks
    USING (organisation_id::text = current_setting('app.current_org_id', true));

CREATE POLICY tenant_isolation ON matter_documents
    USING (organisation_id::text = current_setting('app.current_org_id', true));

CREATE POLICY tenant_isolation ON matter_emails
    USING (organisation_id::text = current_setting('app.current_org_id', true));

CREATE POLICY tenant_isolation ON activity_logs
    USING (organisation_id::text = current_setting('app.current_org_id', true));

CREATE POLICY tenant_isolation ON organisation_members
    USING (organisation_id::text = current_setting('app.current_org_id', true));
"""

if __name__ == "__main__":
    import psycopg2

    from app.core.config import settings

    # Use sync URL, strip asyncpg prefix
    sync_url = settings.database_url_sync
    conn = psycopg2.connect(sync_url)
    conn.autocommit = True
    cur = conn.cursor()
    try:
        cur.execute(RLS_STATEMENTS)
        print("RLS policies applied successfully.")
    except Exception as e:
        print(f"RLS error (may already exist): {e}")
    finally:
        cur.close()
        conn.close()
