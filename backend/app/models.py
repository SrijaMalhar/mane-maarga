from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text
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
    plot_lat: Mapped[float | None] = mapped_column(Numeric(9, 6), nullable=True)
    plot_lon: Mapped[float | None] = mapped_column(Numeric(9, 6), nullable=True)
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
    status: Mapped[str] = mapped_column(
        String(20), default="proposed", nullable=False
    )  # proposed, confirmed, received, rejected
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
    document_id: Mapped[int] = mapped_column(
        ForeignKey("case_documents.id", ondelete="CASCADE"), unique=True, index=True
    )
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
    verification_status: Mapped[str] = mapped_column(String(30), default="pending_review")
    uploaded_by: Mapped[str] = mapped_column(String(120), nullable=False)
    uploaded_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())
    reviewed_by: Mapped[str | None] = mapped_column(String(120), nullable=True)
    review_note: Mapped[str] = mapped_column(Text, default="")
    reviewed_at: Mapped[str | None] = mapped_column(DateTime(timezone=True), nullable=True)
    taken_at: Mapped[str | None] = mapped_column(DateTime(timezone=True), nullable=True)
    gps_lat: Mapped[float | None] = mapped_column(Numeric(9, 6), nullable=True)
    gps_lon: Mapped[float | None] = mapped_column(Numeric(9, 6), nullable=True)
    fingerprint: Mapped[str | None] = mapped_column(String(512), nullable=True)


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


class ApprovalRequest(Base):
    """A gated action waiting for a person. Agents and tools can only create these; only the executor runs them.

    status: pending -> approved -> executed, or rejected / expired. The payload is hashed when the request is
    made and checked again before it runs, so what the family approved is exactly what happens.
    """

    __tablename__ = "approval_requests"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("cases.id", ondelete="CASCADE"), index=True)
    action: Mapped[str] = mapped_column(String(60), nullable=False)  # a key in policies/gated_actions.yaml
    payload_json: Mapped[str] = mapped_column(Text, default="{}")
    payload_hash: Mapped[str] = mapped_column(String(64), default="")
    summary_en: Mapped[str] = mapped_column(Text, default="")
    summary_kn: Mapped[str] = mapped_column(Text, default="")
    amount_inr: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    recipient: Mapped[str] = mapped_column(String(200), default="")
    reason: Mapped[str] = mapped_column(Text, default="")
    citations_json: Mapped[str] = mapped_column(Text, default="[]")
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    approver: Mapped[str] = mapped_column(String(20), default="family")  # family (OTP) or admin
    method: Mapped[str | None] = mapped_column(String(20), nullable=True)  # otp, voice_otp, admin
    approver_ref: Mapped[str | None] = mapped_column(String(120), nullable=True)
    token_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    requested_by: Mapped[str] = mapped_column(String(120), nullable=False)
    decided_by: Mapped[str | None] = mapped_column(String(120), nullable=True)
    decision_note: Mapped[str] = mapped_column(Text, default="")
    result_json: Mapped[str] = mapped_column(Text, default="{}")
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    executed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ApprovalOtp(Base):
    """A one-time code for one approval. Only an HMAC of the code is stored."""

    __tablename__ = "approval_otps"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    approval_id: Mapped[int] = mapped_column(ForeignKey("approval_requests.id", ondelete="CASCADE"), index=True)
    code_hmac: Mapped[str] = mapped_column(String(64), nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    used: Mapped[bool] = mapped_column(Boolean, default=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class OutboxMessage(Base):
    """Messages and external actions that would leave the system. Simulated until a real channel is connected."""

    __tablename__ = "outbox_messages"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    channel: Mapped[str] = mapped_column(String(20), nullable=False)  # sms, whatsapp, portal, payment, share
    to_ref: Mapped[str] = mapped_column(String(200), default="")
    case_id: Mapped[int | None] = mapped_column(ForeignKey("cases.id", ondelete="CASCADE"), nullable=True, index=True)
    approval_id: Mapped[int | None] = mapped_column(
        ForeignKey("approval_requests.id", ondelete="SET NULL"), nullable=True
    )
    subject: Mapped[str] = mapped_column(String(200), default="")
    body: Mapped[str] = mapped_column(Text, default="")
    simulated: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AgentRun(Base):
    """One agent run on a case: the goal, the provider, how it ended and what it told the operator."""

    __tablename__ = "agent_runs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("cases.id", ondelete="CASCADE"), index=True)
    provider: Mapped[str] = mapped_column(String(40), nullable=False)
    goal: Mapped[str] = mapped_column(Text, default="")
    language: Mapped[str] = mapped_column(String(4), default="en")
    status: Mapped[str] = mapped_column(
        String(20), default="running"
    )  # running, done, asked, blocked, failed, step_limit
    message_en: Mapped[str] = mapped_column(Text, default="")
    message_kn: Mapped[str] = mapped_column(Text, default="")
    citations_json: Mapped[str] = mapped_column(Text, default="[]")
    created_by: Mapped[str] = mapped_column(String(120), nullable=False)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())
    finished_at: Mapped[str | None] = mapped_column(DateTime(timezone=True), nullable=True)
    seal: Mapped[str | None] = mapped_column(String(64), nullable=True)


class AgentStep(Base):
    """One step of a run: PLAN, ACT, CHECK, RECOVER, ASK or DONE, with the tool call and its result."""

    __tablename__ = "agent_steps"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("agent_runs.id", ondelete="CASCADE"), index=True)
    idx: Mapped[int] = mapped_column(Integer, nullable=False)
    phase: Mapped[str] = mapped_column(String(10), nullable=False)
    thought_summary: Mapped[str] = mapped_column(Text, default="")
    tool: Mapped[str | None] = mapped_column(String(60), nullable=True)
    args_json: Mapped[str] = mapped_column(Text, default="{}")
    result_json: Mapped[str] = mapped_column(Text, default="{}")
    error: Mapped[str | None] = mapped_column(String(80), nullable=True)
    message_en: Mapped[str] = mapped_column(Text, default="")
    message_kn: Mapped[str] = mapped_column(Text, default="")
    citations_json: Mapped[str] = mapped_column(Text, default="[]")
    ms: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    seal: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())
