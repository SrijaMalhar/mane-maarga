"""Family progress links: a revocable, read-only page per house. Only an HMAC nonce and the token's hash are kept."""

import sqlalchemy as sa
from alembic import op

revision = "0008_progress_links"
down_revision = "0007_photo_checks"
branch_labels = None
depends_on = None


def upgrade():
    if "progress_links" in sa.inspect(op.get_bind()).get_table_names():
        return
    op.create_table(
        "progress_links",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("case_id", sa.Integer, sa.ForeignKey("cases.id", ondelete="CASCADE"), index=True),
        sa.Column("nonce", sa.String(64), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True, index=True),
        sa.Column("show_map", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("created_by", sa.String(120), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_by", sa.String(120), nullable=True),
        sa.Column("views", sa.Integer, nullable=False, server_default="0"),
        sa.Column("last_viewed_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade():
    op.drop_table("progress_links")
