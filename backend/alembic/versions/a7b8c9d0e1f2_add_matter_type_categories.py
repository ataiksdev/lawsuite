"""add matter type categories

Revision ID: a7b8c9d0e1f2
Revises: f1a2b3c4d5e6
Create Date: 2026-06-24 13:10:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "a7b8c9d0e1f2"
down_revision: Union[str, None] = "f1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


NEW_MATTER_TYPES = (
    "corporate",
    "property",
    "intellectual_property",
    "labour",
    "adr",
    "probate",
    "entertainment",
    "sports",
    "audit",
)


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    with op.get_context().autocommit_block():
        for matter_type in NEW_MATTER_TYPES:
            op.execute(f"ALTER TYPE mattertype ADD VALUE IF NOT EXISTS '{matter_type}'")


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    op.execute(
        "UPDATE matters SET matter_type = 'advisory' "
        f"WHERE matter_type IN ({', '.join(repr(t) for t in NEW_MATTER_TYPES)})"
    )
    op.execute("ALTER TYPE mattertype RENAME TO mattertype_old")
    op.execute(
        "CREATE TYPE mattertype AS ENUM "
        "('advisory', 'litigation', 'compliance', 'drafting', 'transactional')"
    )
    op.execute(
        "ALTER TABLE matters ALTER COLUMN matter_type TYPE mattertype "
        "USING matter_type::text::mattertype"
    )
    op.execute("DROP TYPE mattertype_old")
