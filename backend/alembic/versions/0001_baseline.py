"""Baseline schema for existing Sooru MVP tables.

For new databases, creates the current SQLAlchemy metadata. For legacy databases,
create_all is non-destructive and the consent_status column is added if missing.
"""
from alembic import op
from sqlalchemy import inspect, text
from app.database import Base
from app import models  # noqa: F401

revision = "0001_baseline"
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind)
    columns = {c["name"] for c in inspect(bind).get_columns("cases")}
    if "consent_status" not in columns:
        op.add_column("cases", __import__("sqlalchemy").Column("consent_status", __import__("sqlalchemy").String(20), server_default="pending"))

def downgrade():
    # Baseline downgrade intentionally does not drop application data.
    pass
