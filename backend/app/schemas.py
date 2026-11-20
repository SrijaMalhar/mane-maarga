from pydantic import BaseModel, ConfigDict, Field
from typing import Literal

Status = Literal["intake", "verified", "planning", "finance_review", "construction", "completed"]

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
    recorded_at: str | None
    model_config = ConfigDict(from_attributes=True)

class AuditOut(BaseModel):
    id: int
    case_id: int | None
    actor: str
    action: str
    detail: str
    created_at: str | None
    model_config = ConfigDict(from_attributes=True)
