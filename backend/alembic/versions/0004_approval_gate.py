"""Approval gate: payload hash, plain summaries, approver, family link, expiry; OTP codes; outbox."""

import sqlalchemy as sa
from alembic import op

revision = "0004_approval_gate"
down_revision = "0003_agent_runs"
branch_labels = None
depends_on = None

NEW_COLUMNS = [
    sa.Column("payload_hash", sa.String(64), server_default=""),
    sa.Column("summary_en", sa.Text, server_default=""),
    sa.Column("summary_kn", sa.Text, server_default=""),
    sa.Column("amount_inr", sa.Numeric(12, 2), nullable=True),
    sa.Column("recipient", sa.String(200), server_default=""),
    sa.Column("approver", sa.String(20), server_default="family"),
    sa.Column("method", sa.String(20), nullable=True),
    sa.Column("approver_ref", sa.String(120), nullable=True),
    sa.Column("token_hash", sa.String(64), nullable=True),
    sa.Column("result_json", sa.Text, server_default="{}"),
    sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
    sa.Column("executed_at", sa.DateTime(timezone=True), nullable=True),
]


def upgrade():
    bind = op.get_bind()
    insp = sa.inspect(bind)
    have = {c["name"] for c in insp.get_columns("approval_requests")}
    for col in NEW_COLUMNS:
        if col.name not in have:
            op.add_column("approval_requests", col)
    if bind.dialect.name == "postgresql":
        op.alter_column("approval_requests", "action", type_=sa.String(60))
    if "token_hash" not in have:
        op.create_index("ix_approval_requests_token_hash", "approval_requests", ["token_hash"])
    tables = insp.get_table_names()
    if "approval_otps" not in tables:
        op.create_table(
            "approval_otps",
            sa.Column("id", sa.Integer, primary_key=True),
            sa.Column("approval_id", sa.Integer, sa.ForeignKey("approval_requests.id", ondelete="CASCADE"), index=True),
            sa.Column("code_hmac", sa.String(64), nullable=False),
            sa.Column("attempts", sa.Integer, server_default="0"),
            sa.Column("used", sa.Boolean, server_default=sa.false()),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
    if "outbox_messages" not in tables:
        op.create_table(
            "outbox_messages",
            sa.Column("id", sa.Integer, primary_key=True),
            sa.Column("channel", sa.String(20), nullable=False),
            sa.Column("to_ref", sa.String(200), server_default=""),
            sa.Column("case_id", sa.Integer, sa.ForeignKey("cases.id", ondelete="CASCADE"), nullable=True, index=True),
            sa.Column("approval_id", sa.Integer, sa.ForeignKey("approval_requests.id", ondelete="SET NULL"), nullable=True),
            sa.Column("subject", sa.String(200), server_default=""),
            sa.Column("body", sa.Text, server_default=""),
            sa.Column("simulated", sa.Boolean, server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )


def downgrade():
    op.drop_table("outbox_messages")
    op.drop_table("approval_otps")
    op.drop_index("ix_approval_requests_token_hash", table_name="approval_requests")
    for col in reversed(NEW_COLUMNS):
        op.drop_column("approval_requests", col.name)
