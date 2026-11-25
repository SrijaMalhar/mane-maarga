"""Approval requests: changes that agents and tools may propose but only a person may approve."""

import sqlalchemy as sa
from alembic import op

revision = "0002_approval_requests"
down_revision = "0001_baseline"
branch_labels = None
depends_on = None


def upgrade():
    if "approval_requests" in sa.inspect(op.get_bind()).get_table_names():
        return  # created by the baseline's create_all on a fresh database
    op.create_table(
        "approval_requests",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("case_id", sa.Integer, sa.ForeignKey("cases.id", ondelete="CASCADE"), index=True),
        sa.Column("action", sa.String(40), nullable=False),
        sa.Column("payload_json", sa.Text, server_default="{}"),
        sa.Column("reason", sa.Text, server_default=""),
        sa.Column("citations_json", sa.Text, server_default="[]"),
        sa.Column("status", sa.String(20), server_default="pending", nullable=False),
        sa.Column("requested_by", sa.String(120), nullable=False),
        sa.Column("decided_by", sa.String(120), nullable=True),
        sa.Column("decision_note", sa.Text, server_default=""),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade():
    op.drop_table("approval_requests")
