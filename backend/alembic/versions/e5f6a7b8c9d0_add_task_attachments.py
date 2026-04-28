"""Add task attachments: task_id on matter_notes, task_document_links table

Revision ID: e5f6a7b8c9d0
Revises: d1e2f3a4b5c6
Create Date: 2026-04-28 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, None] = "d1e2f3a4b5c6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add task_id to matter_notes (nullable, SET NULL on task delete)
    op.add_column(
        "matter_notes",
        sa.Column(
            "task_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tasks.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_matter_notes_task_id", "matter_notes", ["task_id"])

    # Create task_document_links join table
    op.create_table(
        "task_document_links",
        sa.Column(
            "task_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tasks.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "document_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("matter_documents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("organisation_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "linked_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "linked_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("task_id", "document_id"),
    )
    op.create_index("ix_task_document_links_task_id", "task_document_links", ["task_id"])
    op.create_index("ix_task_document_links_document_id", "task_document_links", ["document_id"])


def downgrade() -> None:
    op.drop_index("ix_task_document_links_document_id", table_name="task_document_links")
    op.drop_index("ix_task_document_links_task_id", table_name="task_document_links")
    op.drop_table("task_document_links")
    op.drop_index("ix_matter_notes_task_id", table_name="matter_notes")
    op.drop_column("matter_notes", "task_id")
