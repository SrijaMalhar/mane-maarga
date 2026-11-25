"""HTTP routes for the finance engine. Stateless, authenticated, indicative only."""

from dataclasses import asdict
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..core.security import current_user
from ..engine import affordability as aff
from ..engine.ladder import build_ladder
from ..engine.rules import load_pack

DISCLAIMER = (
    "Indicative calculation from illustrative assumptions. Not an eligibility, credit or payment "
    "decision; verify current scheme rules and lender terms before relying on it."
)


class LadderIn(BaseModel):
    state: str = Field("KA", min_length=2, max_length=2)
    total_cost: float = Field(gt=0, le=100_000_000)
    own_savings: float = Field(0, ge=0, le=100_000_000)
    scheme_loan: float = Field(0, ge=0, le=100_000_000)
    extra_grants: float = Field(0, ge=0, le=100_000_000)


class LoanIn(BaseModel):
    name: str = Field(max_length=80)
    principal: float = Field(ge=0, le=100_000_000)
    rate_pa: float = Field(ge=0, le=1)
    months: int = Field(gt=0, le=360)


class AffordabilityIn(BaseModel):
    monthly_income: list[float] = Field(min_length=1, max_length=24)
    existing_loans: list[LoanIn] = Field(default_factory=list, max_length=20)
    requested: float = Field(gt=0, le=100_000_000)
    rate_pa: float = Field(ge=0, le=1)
    months: int = Field(gt=0, le=360)


router = APIRouter(prefix="/api/engine", tags=["engine"])


def pack_for(state: str):
    try:
        return load_pack(state=state.upper(), on=date.today())
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/ladder")
def ladder(body: LadderIn, user=Depends(current_user)):
    out = build_ladder(pack_for(body.state), body.total_cost, body.own_savings, body.scheme_loan, body.extra_grants)
    return {**out, "disclaimer": DISCLAIMER}


@router.post("/affordability")
def affordability(body: AffordabilityIn, user=Depends(current_user)):
    if any(v < 0 for v in body.monthly_income):
        raise HTTPException(status_code=422, detail="monthly_income values must be non-negative")
    loans = [aff.Loan(**loan.model_dump()) for loan in body.existing_loans]
    res = asdict(aff.assess(body.monthly_income, loans, body.requested, body.rate_pa, body.months))
    res["indicative_loan_within_cap"] = res.pop("approved_new_loan")
    return {**res, "disclaimer": DISCLAIMER}
