"""Flight Recorder: a hash-chain seal on every agent step and on each run's outcome."""

import sqlalchemy as sa
from alembic import op

revision = "0005_flight_recorder"
down_revision = "0004_approval_gate"
branch_labels = None
depends_on = None


def upgrade():
    insp = sa.inspect(op.get_bind())
    for table in ("agent_runs", "agent_steps"):
        if "seal" not in {c["name"] for c in insp.get_columns(table)}:
            op.add_column(table, sa.Column("seal", sa.String(64), nullable=True))


def downgrade():
    op.drop_column("agent_steps", "seal")
    op.drop_column("agent_runs", "seal")
