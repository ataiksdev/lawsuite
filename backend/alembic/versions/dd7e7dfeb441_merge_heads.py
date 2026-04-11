"""Merge heads

Revision ID: dd7e7dfeb441
Revises: 5c77fc9ce9e7, a1b2c3d4e5f6
Create Date: 2026-04-11 09:41:42.203841

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'dd7e7dfeb441'
down_revision: Union[str, None] = ('5c77fc9ce9e7', 'a1b2c3d4e5f6')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
