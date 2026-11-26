from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Status = Literal["intake", "verified", "planning", "finance_review", "construction", "completed"]
Role = Literal["admin", "operator", "viewer"]


class CaseCreate(BaseModel):
    beneficiary_name: str = Field(min_length=2, max_length=160)
    village: str = Field(min_length=1, max_length=160)
    taluk: str = Field(min_length=1, max_length=160)
    phone_last4: str = Field(default="", pattern=r"^$|^\d{4}$")
    status: Status = "intake"
    sanctioned_amount: float = Field(default=0, ge=0)
    estimated_cost: float = Field(default=0, ge=0)
    existing_loan: float = Field(default=0, ge=0)
    notes: str = ""
    plot_lat: float | None = Field(default=None, ge=-90, le=90)
    plot_lon: float | None = Field(default=None, ge=-180, le=180)


class CaseUpdate(BaseModel):
    beneficiary_name: str | None = Field(default=None, min_length=2, max_length=160)
    village: str | None = Field(default=None, max_length=160)
    taluk: str | None = Field(default=None, max_length=160)
    phone_last4: str | None = Field(default=None, pattern=r"^$|^\d{4}$")
    status: Status | None = None
    sanctioned_amount: float | None = Field(default=None, ge=0)
    estimated_cost: float | None = Field(default=None, ge=0)
    existing_loan: float | None = Field(default=None, ge=0)
    notes: str | None = None
    plot_lat: float | None = Field(default=None, ge=-90, le=90)
    plot_lon: float | None = Field(default=None, ge=-180, le=180)


class CaseOut(CaseCreate):
    id: int
    gap_amount: float
    consent_status: str = "pending"
    model_config = ConfigDict(from_attributes=True)


class ConsentCreate(BaseModel):
    consent_given: bool
    consent_scope: str = Field(default="case_processing", max_length=80)
    consent_text_version: str = Field(default="v1", max_length=40)
    notes: str = ""


class ConsentOut(BaseModel):
    id: int
    case_id: int
    consent_given: bool
    consent_scope: str
    consent_text_version: str
    recorded_by: str
    notes: str
    recorded_at: datetime | None
    model_config = ConfigDict(from_attributes=True)


class AuditOut(BaseModel):
    id: int
    case_id: int | None
    actor: str
    action: str
    detail: str
    created_at: datetime | None
    model_config = ConfigDict(from_attributes=True)


class BootstrapRequest(BaseModel):
    username: str = Field(min_length=3, max_length=80)
    email: str = Field(min_length=5, max_length=160)
    password: str = Field(min_length=12, max_length=128)


class LoginRequest(BaseModel):
    username: str = Field(min_length=3, max_length=80)
    password: str = Field(min_length=1, max_length=128)


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=80)
    email: str = Field(min_length=5, max_length=160)
    password: str = Field(min_length=12, max_length=128)
    role: Role = "operator"


class UserOut(BaseModel):
    id: int
    username: str
    email: str
    role: Role
    is_active: bool
    created_at: datetime | None
    model_config = ConfigDict(from_attributes=True)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class DocumentOut(BaseModel):
    id: int
    case_id: int
    original_name: str
    content_type: str
    size_bytes: int
    verification_status: str
    uploaded_by: str
    uploaded_at: datetime | None
    model_config = ConfigDict(from_attributes=True)


FundingStatus = Literal["proposed", "confirmed", "received", "rejected"]
FundingType = Literal["subsidy", "loan", "savings", "wages", "grant", "other"]


class FundingCreate(BaseModel):
    source_type: FundingType
    source_name: str = Field(min_length=2, max_length=160)
    amount: float = Field(gt=0, le=100000000)
    status: FundingStatus = "proposed"
    scheme_code: str | None = Field(default=None, max_length=40)
    reference_number: str | None = Field(default=None, max_length=100)
    evidence_document_id: int | None = None
    notes: str = Field(default="", max_length=2000)


class FundingOut(FundingCreate):
    id: int
    case_id: int
    created_by: str
    created_at: datetime | None
    model_config = ConfigDict(from_attributes=True)


class StageCreate(BaseModel):
    stage_code: str = Field(min_length=2, max_length=40)
    stage_name: str = Field(min_length=2, max_length=120)
    planned_cost: float = Field(gt=0, le=100000000)
    planned_start: datetime | None = None
    planned_end: datetime | None = None
    notes: str = Field(default="", max_length=2000)


class StageOut(StageCreate):
    id: int
    case_id: int
    status: Literal["planned", "in_progress", "verified", "completed", "blocked"]
    created_by: str
    created_at: datetime | None
    model_config = ConfigDict(from_attributes=True)


class StageStatusUpdate(BaseModel):
    status: Literal["planned", "in_progress", "verified", "completed", "blocked"]
    notes: str = Field(default="", max_length=2000)


class FinanceSummary(BaseModel):
    case_id: int
    estimated_cost: float
    funding_confirmed: float
    funding_received: float
    funding_proposed: float
    funding_gap: float
    existing_loans: float
    stages: list[dict]
    warnings: list[str]


class ExtractionOut(BaseModel):
    id: int
    document_id: int
    extraction_status: str
    document_type: str
    extracted_fields: dict
    checks: list[dict]
    engine: str
    confidence: float
    extracted_at: datetime | None


class ExtractionRequest(BaseModel):
    force: bool = False
