"""study flow columns

Revision ID: 0003
Revises: 0002
"""

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("study_sessions") as batch:
        batch.add_column(sa.Column("synthetic", sa.Boolean(), nullable=False, server_default=sa.true()))
        batch.add_column(sa.Column("step", sa.Integer(), nullable=False, server_default="0"))
        batch.add_column(sa.Column("started_at", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("consent", sa.JSON(), nullable=False, server_default="{}"))
        batch.add_column(sa.Column("demographics", sa.JSON(), nullable=False, server_default="{}"))
        batch.add_column(sa.Column("debrief", sa.JSON(), nullable=False, server_default="{}"))
    with op.batch_alter_table("study_tasks") as batch:
        batch.add_column(sa.Column("task_index", sa.Integer(), nullable=False, server_default="0"))
        batch.add_column(sa.Column("block", sa.Integer(), nullable=False, server_default="1"))
        batch.add_column(sa.Column("fix_text", sa.Text(), nullable=True))
    op.drop_table("sus_responses")
    op.create_table(
        "sus_responses",
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("block", sa.Integer(), nullable=False),
        sa.Column("item", sa.Integer(), nullable=False),
        sa.Column("condition", sa.String(), nullable=False),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["study_sessions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("session_id", "block", "item"),
    )
    op.create_table(
        "study_runs",
        sa.Column("task_id", sa.String(), nullable=False),
        sa.Column("condition", sa.String(), nullable=False),
        sa.Column("run_id", sa.String(), nullable=False),
        sa.PrimaryKeyConstraint("task_id", "condition"),
    )


def downgrade() -> None:
    op.drop_table("study_runs")
    op.drop_table("sus_responses")
    op.create_table(
        "sus_responses",
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("item", sa.Integer(), nullable=False),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["study_sessions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("session_id", "item"),
    )
    with op.batch_alter_table("study_tasks") as batch:
        batch.drop_column("fix_text")
        batch.drop_column("block")
        batch.drop_column("task_index")
    with op.batch_alter_table("study_sessions") as batch:
        for col in ("debrief", "demographics", "consent", "completed_at", "started_at", "step", "synthetic"):
            batch.drop_column(col)
