"""make matter_notes.matter_id nullable (standalone notes)

Revision ID: d1e2f3a4b5c6
Revises: c4d5e6f7a8b9
Create Date: 2026-04-13 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "d1e2f3a4b5c6"
down_revision: Union[str, None] = "c4d5e6f7a8b9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop the old NOT NULL foreign key constraint and replace with nullable
    op.alter_column(
        "matter_notes",
        "matter_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=True,
    )
    # Change the FK to SET NULL on delete (was CASCADE) by dropping + recreating
    op.drop_constraint("matter_notes_matter_id_fkey", "matter_notes", type_="foreignkey")
    op.create_foreign_key(
        "matter_notes_matter_id_fkey",
        "matter_notes",
        "matters",
        ["matter_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # Add org-level index that doesn't require matter_id
    op.create_index(
        "ix_matter_notes_org_updated",
        "matter_notes",
        ["organisation_id", "updated_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_matter_notes_org_updated", table_name="matter_notes")
    op.drop_constraint("matter_notes_matter_id_fkey", "matter_notes", type_="foreignkey")
    op.create_foreign_key(
        "matter_notes_matter_id_fkey",
        "matter_notes",
        "matters",
        ["matter_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.alter_column(
        "matter_notes",
        "matter_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=False,
    )
