"""
Row Level Security helper.

Run this ONCE after the initial migration to add RLS policies
to all tenant-scoped tables.

Usage:
    poetry run python -m app.models.rls

RLS enforces that every query against a tenant table is automatically
filtered to the current organisation, even if app code forgets to filter.
Two session GUCs drive the policies, set per-request by
app.core.deps.get_scoped_db / app.core.database.get_db:

  - app.current_org_id  -- the tenant id the current session is scoped to
  - app.bypass_rls      -- 'on' for paths that legitimately need cross-org
                           access (platform admin, webhooks, background
                           workers) instead of relying on connection role
                           privileges, since those all share one DB role.

This ONLY takes effect if the connecting role is not a superuser and not
the table owner (both bypass RLS unconditionally) -- see
scripts/setup_local_rls_role.sql for provisioning a dedicated app role.

NOTE: For development simplicity, RLS is defined here as raw SQL
that can be run manually or as part of a post-migration script.
In production (Supabase), run the equivalent SQL against your project
(see scripts/setup_local_rls_role.sql for the template).
"""

TENANT_TABLES = [
    "clients",
    "matters",
    "tasks",
    "matter_documents",
    "matter_document_versions",
    "matter_emails",
    "activity_logs",
    "organisation_members",
    "fee_arrangements",
    "invoices",
    "invoice_line_items",
    "disbursements",
    "payments",
    "audit_logs",
]

_BYPASS = "current_setting('app.bypass_rls', true) = 'on'"
_ORG_MATCH = "organisation_id::text = current_setting('app.current_org_id', true)"

RLS_STATEMENTS = f"""
-- Enable + force RLS on all tenant-scoped tables (FORCE also applies it
-- to the table owner, in case the app role is ever granted ownership).
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
ALTER TABLE fee_arrangements ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_arrangements FORCE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_line_items FORCE ROW LEVEL SECURITY;
ALTER TABLE disbursements ENABLE ROW LEVEL SECURITY;
ALTER TABLE disbursements FORCE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

-- Policies: each row is visible only to the matching organisation,
-- unless the session has explicitly opted into app.bypass_rls = 'on'
-- (platform admin / webhooks / celery workers -- see database.py).
-- We use DROP POLICY IF EXISTS to make this script idempotent.

DROP POLICY IF EXISTS tenant_isolation ON clients;
CREATE POLICY tenant_isolation ON clients
    USING ({_BYPASS} OR {_ORG_MATCH});

DROP POLICY IF EXISTS tenant_isolation ON matters;
CREATE POLICY tenant_isolation ON matters
    USING ({_BYPASS} OR {_ORG_MATCH});

DROP POLICY IF EXISTS tenant_isolation ON tasks;
CREATE POLICY tenant_isolation ON tasks
    USING ({_BYPASS} OR {_ORG_MATCH});

DROP POLICY IF EXISTS tenant_isolation ON matter_documents;
CREATE POLICY tenant_isolation ON matter_documents
    USING ({_BYPASS} OR {_ORG_MATCH});

-- Special policy for document versions: check parent document's organisation
DROP POLICY IF EXISTS tenant_isolation ON matter_document_versions;
CREATE POLICY tenant_isolation ON matter_document_versions
    USING (
        {_BYPASS}
        OR EXISTS (
            SELECT 1 FROM matter_documents
            WHERE matter_documents.id = matter_document_versions.document_id
            AND matter_documents.organisation_id::text = current_setting('app.current_org_id', true)
        )
    );

DROP POLICY IF EXISTS tenant_isolation ON matter_emails;
CREATE POLICY tenant_isolation ON matter_emails
    USING ({_BYPASS} OR {_ORG_MATCH});

DROP POLICY IF EXISTS tenant_isolation ON activity_logs;
CREATE POLICY tenant_isolation ON activity_logs
    USING ({_BYPASS} OR {_ORG_MATCH});

DROP POLICY IF EXISTS tenant_isolation ON organisation_members;
CREATE POLICY tenant_isolation ON organisation_members
    USING ({_BYPASS} OR {_ORG_MATCH});

-- Invoicing tables all carry their own organisation_id directly, so they
-- all use the simple direct-match policy (no EXISTS subquery needed).
DROP POLICY IF EXISTS tenant_isolation ON fee_arrangements;
CREATE POLICY tenant_isolation ON fee_arrangements
    USING ({_BYPASS} OR {_ORG_MATCH});

DROP POLICY IF EXISTS tenant_isolation ON invoices;
CREATE POLICY tenant_isolation ON invoices
    USING ({_BYPASS} OR {_ORG_MATCH});

DROP POLICY IF EXISTS tenant_isolation ON invoice_line_items;
CREATE POLICY tenant_isolation ON invoice_line_items
    USING ({_BYPASS} OR {_ORG_MATCH});

DROP POLICY IF EXISTS tenant_isolation ON disbursements;
CREATE POLICY tenant_isolation ON disbursements
    USING ({_BYPASS} OR {_ORG_MATCH});

DROP POLICY IF EXISTS tenant_isolation ON payments;
CREATE POLICY tenant_isolation ON payments
    USING ({_BYPASS} OR {_ORG_MATCH});

DROP POLICY IF EXISTS tenant_isolation ON audit_logs;
CREATE POLICY tenant_isolation ON audit_logs
    USING ({_BYPASS} OR {_ORG_MATCH});
"""

if __name__ == "__main__":
    import psycopg2

    from app.core.config import settings

    # Use sync URL, strip asyncpg/psycopg2 prefix for raw psycopg2 use
    sync_url = settings.database_url_sync.replace("postgresql+psycopg2://", "postgresql://").replace("postgresql+asyncpg://", "postgresql://")
    
    try:
        conn = psycopg2.connect(sync_url)
        conn.autocommit = True
        cur = conn.cursor()
        try:
            cur.execute(RLS_STATEMENTS)
            print("RLS policies applied successfully.")
        except Exception as e:
            print(f"RLS execution error: {e}")
        finally:
            cur.close()
            conn.close()
    except Exception as e:
        print(f"Database connection error: {e}")
