"""Add task_comments and task_watchers tables

Revision ID: a1b2c3d4e5f6
Revises: 18ded1ca8f17
Create Date: 2025-01-01 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '18ded1ca8f17'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── task_comments ──────────────────────────────────────────────────────
    op.create_table(
        'task_comments',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            'task_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('tasks.id', ondelete='CASCADE'),
            nullable=False,
            index=True,
        ),
        sa.Column(
            'matter_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('matters.id', ondelete='CASCADE'),
            nullable=False,
            index=True,
        ),
        sa.Column(
            'organisation_id',
            postgresql.UUID(as_uuid=True),
            nullable=False,
            index=True,
        ),
        sa.Column(
            'author_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('users.id', ondelete='SET NULL'),
            nullable=True,
        ),
        sa.Column('author_name', sa.String(255), nullable=False),
        sa.Column('body', sa.Text, nullable=False),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
    )

    # ── task_watchers ──────────────────────────────────────────────────────
    op.create_table(
        'task_watchers',
        sa.Column(
            'task_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('tasks.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column(
            'user_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('users.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column(
            'organisation_id',
            postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.Column(
            'added_at',
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint('task_id', 'user_id'),
    )

    op.create_index('ix_task_watchers_task_id', 'task_watchers', ['task_id'])
    op.create_index('ix_task_watchers_user_id', 'task_watchers', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_task_watchers_user_id', table_name='task_watchers')
    op.drop_index('ix_task_watchers_task_id', table_name='task_watchers')
    op.drop_table('task_watchers')
    op.drop_table('task_comments')
