"""Site photo review: who reviewed a stage photo, when, and what a retake should show."""

import sqlalchemy as sa
from alembic import op

revision = "0006_photo_review"
down_revision = "0005_flight_recorder"
branch_labels = None
depends_on = None

COLUMNS = [
    sa.Column("reviewed_by", sa.String(120), nullable=True),
    sa.Column("review_note", sa.Text, server_default=""),
    sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
]


def upgrade():
    have = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("construction_evidence")}
    for col in COLUMNS:
        if col.name not in have:
            op.add_column("construction_evidence", col)
    op.execute("UPDATE construction_evidence SET verification_status = 'pending_review' WHERE verification_status = 'pending'")


def downgrade():
    for col in COLUMNS:
        op.drop_column("construction_evidence", col.name)
