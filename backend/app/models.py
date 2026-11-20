from sqlalchemy import String, Integer, Numeric, DateTime, Text, Boolean, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func
from .database import Base

class Case(Base):
    __tablename__ = "cases"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    beneficiary_name: Mapped[str] = mapped_column(String(160))
    village: Mapped[str] = mapped_column(String(160))
    taluk: Mapped[str] = mapped_column(String(160))
    phone_last4: Mapped[str] = mapped_column(String(4), default="")
    status: Mapped[str] = mapped_column(String(40), default="intake")
    sanctioned_amount: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    estimated_cost: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    existing_loan: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    gap_amount: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    consent_status: Mapped[str] = mapped_column(String(20), default="pending")
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())

class ConsentRecord(Base):
    __tablename__ = "consent_records"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("cases.id", ondelete="CASCADE"), index=True)
    consent_given: Mapped[bool] = mapped_column(Boolean, nullable=False)
    consent_scope: Mapped[str] = mapped_column(String(80), default="case_processing")
    consent_text_version: Mapped[str] = mapped_column(String(40), default="v1")
    recorded_by: Mapped[str] = mapped_column(String(120), default="demo_operator")
    notes: Mapped[str] = mapped_column(Text, default="")
    recorded_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())

class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    case_id: Mapped[int | None] = mapped_column(Integer, index=True, nullable=True)
    actor: Mapped[str] = mapped_column(String(120), default="demo_operator")
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    detail: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())
