"""Agent runs and their steps (PLAN, ACT, CHECK, RECOVER, ASK, DONE)."""

import sqlalchemy as sa
from alembic import op

revision = "0003_agent_runs"
down_revision = "0002_approval_requests"
branch_labels = None
depends_on = None


def upgrade():
    existing = sa.inspect(op.get_bind()).get_table_names()
    if "agent_runs" not in existing:
        op.create_table(
            "agent_runs",
            sa.Column("id", sa.Integer, primary_key=True),
            sa.Column("case_id", sa.Integer, sa.ForeignKey("cases.id", ondelete="CASCADE"), index=True),
            sa.Column("provider", sa.String(40), nullable=False),
            sa.Column("goal", sa.Text, server_default=""),
            sa.Column("language", sa.String(4), server_default="en"),
            sa.Column("status", sa.String(20), server_default="running"),
            sa.Column("message_en", sa.Text, server_default=""),
            sa.Column("message_kn", sa.Text, server_default=""),
            sa.Column("citations_json", sa.Text, server_default="[]"),
            sa.Column("created_by", sa.String(120), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        )
    if "agent_steps" not in existing:
        op.create_table(
            "agent_steps",
            sa.Column("id", sa.Integer, primary_key=True),
            sa.Column("run_id", sa.Integer, sa.ForeignKey("agent_runs.id", ondelete="CASCADE"), index=True),
            sa.Column("idx", sa.Integer, nullable=False),
            sa.Column("phase", sa.String(10), nullable=False),
            sa.Column("thought_summary", sa.Text, server_default=""),
            sa.Column("tool", sa.String(60), nullable=True),
            sa.Column("args_json", sa.Text, server_default="{}"),
            sa.Column("result_json", sa.Text, server_default="{}"),
            sa.Column("error", sa.String(80), nullable=True),
            sa.Column("message_en", sa.Text, server_default=""),
            sa.Column("message_kn", sa.Text, server_default=""),
            sa.Column("citations_json", sa.Text, server_default="[]"),
            sa.Column("ms", sa.Numeric(10, 2), server_default="0"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )


def downgrade():
    op.drop_table("agent_steps")
    op.drop_table("agent_runs")
