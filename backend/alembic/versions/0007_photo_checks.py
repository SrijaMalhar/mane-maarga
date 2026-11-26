"""Photo checks: the plot pin on a case; capture time, GPS and an image fingerprint on site photos."""

import sqlalchemy as sa
from alembic import op

revision = "0007_photo_checks"
down_revision = "0006_photo_review"
branch_labels = None
depends_on = None

CASE_COLUMNS = [
    sa.Column("plot_lat", sa.Numeric(9, 6), nullable=True),
    sa.Column("plot_lon", sa.Numeric(9, 6), nullable=True),
]
EVIDENCE_COLUMNS = [
    sa.Column("taken_at", sa.DateTime(timezone=True), nullable=True),
    sa.Column("gps_lat", sa.Numeric(9, 6), nullable=True),
    sa.Column("gps_lon", sa.Numeric(9, 6), nullable=True),
    sa.Column("fingerprint", sa.String(512), nullable=True),
]


def upgrade():
    insp = sa.inspect(op.get_bind())
    for table, cols in (("cases", CASE_COLUMNS), ("construction_evidence", EVIDENCE_COLUMNS)):
        have = {c["name"] for c in insp.get_columns(table)}
        for col in cols:
            if col.name not in have:
                op.add_column(table, col)


def downgrade():
    for col in EVIDENCE_COLUMNS:
        op.drop_column("construction_evidence", col.name)
    for col in CASE_COLUMNS:
        op.drop_column("cases", col.name)
