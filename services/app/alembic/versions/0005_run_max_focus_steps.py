"""run max focus steps

Revision ID: 0005
Revises: 0004
"""

import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("runs", sa.Column("max_focus_steps", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("runs", "max_focus_steps")
