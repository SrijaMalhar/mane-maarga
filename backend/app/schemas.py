from pydantic import BaseModel, ConfigDict, Field
from typing import Literal

Status = Literal["intake", "verified", "planning", "finance_review", "construction", "completed"]

class CaseCreate(BaseModel):
    beneficiary_name: str = Field(min_length=2, max_length=160)
    village: str = Field(min_length=1, max_length=160)
    taluk: str = Field(min_length=1, max_length=160)
    phone_last4: str = Field(default="", pattern=r"^$|^\\d{4}$")
    status: Status = "intake"
    sanctioned_amount: float = Field(default=0, ge=0)
    estimated_cost: float = Field(default=0, ge=0)
    existing_loan: float = Field(default=0, ge=0)
    notes: str = ""

class CaseUpdate(BaseModel):
    beneficiary_name: str | None = Field(default=None, min_length=2, max_length=160)
    village: str | None = Field(default=None, max_length=160)
    taluk: str | None = Field(default=None, max_length=160)
    phone_last4: str | None = Field(default=None, pattern=r"^$|^\\d{4}$")
    status: Status | None = None
    sanctioned_amount: float | None = Field(default=None, ge=0)
    estimated_cost: float | None = Field(default=None, ge=0)
    existing_loan: float | None = Field(default=None, ge=0)
    notes: str | None = None

class CaseOut(CaseCreate):
    id: int
    gap_amount: float
    model_config = ConfigDict(from_attributes=True)
