"""Add notifications table

Revision ID: b2c3d4e5f6a7
Revises: dd7e7dfeb441
Create Date: 2025-01-02 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, None] = 'dd7e7dfeb441'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'notifications',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            'user_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('users.id', ondelete='CASCADE'),
            nullable=False,
            index=True,
        ),
        sa.Column(
            'organisation_id',
            postgresql.UUID(as_uuid=True),
            nullable=False,
            index=True,
        ),
        sa.Column('type', sa.String(50), nullable=False),          # info | success | warning | error
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('message', sa.Text, nullable=False),
        sa.Column('link', sa.String(500)),                         # optional deep-link
        sa.Column('is_read', sa.Boolean, default=False, nullable=False),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
            index=True,
        ),
    )
    op.create_index(
        'ix_notifications_user_unread',
        'notifications',
        ['user_id', 'is_read', 'created_at'],
    )


def downgrade() -> None:
    op.drop_index('ix_notifications_user_unread', table_name='notifications')
    op.drop_table('notifications')
