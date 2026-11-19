from sqlalchemy import String, Integer, Numeric, DateTime, Text, Boolean, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func
from .database import Base

class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(80), unique=True, index=True, nullable=False)
    email: Mapped[str] = mapped_column(String(160), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(20), default="operator", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())

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

class CaseDocument(Base):
    __tablename__ = "case_documents"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("cases.id", ondelete="CASCADE"), index=True)
    original_name: Mapped[str] = mapped_column(String(255), nullable=False)
    stored_name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    content_type: Mapped[str] = mapped_column(String(120), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    verification_status: Mapped[str] = mapped_column(String(30), default="pending", nullable=False)
    uploaded_by: Mapped[str] = mapped_column(String(120), nullable=False)
    uploaded_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())

class CaseFundingSource(Base):
    __tablename__ = "case_funding_sources"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("cases.id", ondelete="CASCADE"), index=True)
    source_type: Mapped[str] = mapped_column(String(40), nullable=False)  # subsidy, loan, savings, wages, grant, other
    source_name: Mapped[str] = mapped_column(String(160), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="proposed", nullable=False) # proposed, confirmed, received, rejected
    scheme_code: Mapped[str | None] = mapped_column(String(40), nullable=True)
    reference_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    evidence_document_id: Mapped[int | None] = mapped_column(ForeignKey("case_documents.id"), nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")
    created_by: Mapped[str] = mapped_column(String(120), nullable=False)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())

class ConstructionStage(Base):
    __tablename__ = "construction_stages"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("cases.id", ondelete="CASCADE"), index=True)
    stage_code: Mapped[str] = mapped_column(String(40), nullable=False)
    stage_name: Mapped[str] = mapped_column(String(120), nullable=False)
    planned_cost: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    planned_start: Mapped[str | None] = mapped_column(DateTime(timezone=True), nullable=True)
    planned_end: Mapped[str | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="planned", nullable=False)
    notes: Mapped[str] = mapped_column(Text, default="")
    created_by: Mapped[str] = mapped_column(String(120), nullable=False)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())

class DocumentExtraction(Base):
    __tablename__ = "document_extractions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("case_documents.id", ondelete="CASCADE"), unique=True, index=True)
    extraction_status: Mapped[str] = mapped_column(String(30), nullable=False, default="pending")
    document_type: Mapped[str] = mapped_column(String(60), default="unknown")
    extracted_fields_json: Mapped[str] = mapped_column(Text, default="{}")
    checks_json: Mapped[str] = mapped_column(Text, default="[]")
    engine: Mapped[str] = mapped_column(String(60), default="unknown")
    confidence: Mapped[float] = mapped_column(Numeric(4, 3), default=0)
    extracted_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())

class IntakeSession(Base):
    __tablename__ = "intake_sessions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    language: Mapped[str] = mapped_column(String(20), default="kn")
    state_json: Mapped[str] = mapped_column(Text, default="{}")
    transcript_json: Mapped[str] = mapped_column(Text, default="[]")
    status: Mapped[str] = mapped_column(String(20), default="in_progress")
    created_by: Mapped[str] = mapped_column(String(120), default="anonymous")
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())

class BudgetPlan(Base):
    __tablename__ = "budget_plans"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("cases.id", ondelete="CASCADE"), index=True)
    plan_json: Mapped[str] = mapped_column(Text, nullable=False)
    created_by: Mapped[str] = mapped_column(String(120), nullable=False)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())

class ConstructionEvidence(Base):
    __tablename__ = "construction_evidence"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("cases.id", ondelete="CASCADE"), index=True)
    stage_id: Mapped[int] = mapped_column(ForeignKey("construction_stages.id", ondelete="CASCADE"), index=True)
    stored_name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    original_name: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(120), nullable=False)
    caption: Mapped[str] = mapped_column(Text, default="")
    verification_status: Mapped[str] = mapped_column(String(30), default="pending")
    uploaded_by: Mapped[str] = mapped_column(String(120), nullable=False)
    uploaded_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())

class RecoveryTask(Base):
    __tablename__ = "recovery_tasks"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("cases.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str] = mapped_column(String(40), default="document")
    description: Mapped[str] = mapped_column(Text, default="")
    due_date: Mapped[str | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="open")
    owner: Mapped[str] = mapped_column(String(120), default="")
    created_by: Mapped[str] = mapped_column(String(120), nullable=False)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())

class EvaluationRun(Base):
    __tablename__ = "evaluation_runs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    suite_name: Mapped[str] = mapped_column(String(100), nullable=False)
    result_json: Mapped[str] = mapped_column(Text, nullable=False)
    created_by: Mapped[str] = mapped_column(String(120), nullable=False)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())
