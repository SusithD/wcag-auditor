"""finding decisions

Revision ID: 0004
Revises: 0003
"""

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("findings") as batch:
        batch.add_column(sa.Column("decision_reason", sa.Text(), nullable=True))
        batch.add_column(sa.Column("decision_note", sa.Text(), nullable=True))
        batch.add_column(sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("decided_by", sa.String(), nullable=True))
    op.execute("UPDATE findings SET status = 'dismissed' WHERE status = 'ignored'")


def downgrade() -> None:
    op.execute("UPDATE findings SET status = 'ignored' WHERE status = 'dismissed'")
    op.execute("UPDATE findings SET status = 'open' WHERE status IN ('confirmed', 'unsure')")
    with op.batch_alter_table("findings") as batch:
        batch.drop_column("decided_by")
        batch.drop_column("decided_at")
        batch.drop_column("decision_note")
        batch.drop_column("decision_reason")
