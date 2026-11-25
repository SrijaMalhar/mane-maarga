"""HTTP routes for the finance engine. Stateless, authenticated, indicative only."""

from dataclasses import asdict
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..core.security import current_user
from ..engine import affordability as aff
from ..engine.ladder import build_ladder
from ..engine.rules import check_eligibility, load_pack

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


class EligibilityIn(BaseModel):
    state: str = Field("KA", min_length=2, max_length=2)
    scheme: str = Field("PMAY-G", max_length=40)
    on: date | None = None
    facts: dict[str, bool | int | float | str | None] = Field(default_factory=dict)


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


def pack_for(state: str, scheme: str = "PMAY-G", on: date | None = None):
    try:
        return load_pack(state=state.upper(), scheme=scheme, on=on or date.today())
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/ladder")
def ladder(body: LadderIn, user=Depends(current_user)):
    pack = pack_for(body.state)
    out = build_ladder(pack, body.total_cost, body.own_savings, body.scheme_loan, body.extra_grants)
    citations = [pack.amount_clause("unit_assistance"), pack.amount_clause("scheme_loan_max")]
    return {
        **out,
        "pack_id": pack.pack_id,
        "stages_verified": pack.stages_verified,
        "citations": citations,
        "disclaimer": DISCLAIMER,
    }


@router.post("/affordability")
def affordability(body: AffordabilityIn, user=Depends(current_user)):
    if any(v < 0 for v in body.monthly_income):
        raise HTTPException(status_code=422, detail="monthly_income values must be non-negative")
    loans = [aff.Loan(**loan.model_dump()) for loan in body.existing_loans]
    res = asdict(aff.assess(body.monthly_income, loans, body.requested, body.rate_pa, body.months))
    res["indicative_loan_within_cap"] = res.pop("approved_new_loan")
    return {**res, "disclaimer": DISCLAIMER}


@router.post("/eligibility")
def eligibility(body: EligibilityIn, user=Depends(current_user)):
    """Evaluate the pack's eligibility and exclusion rules over the facts given. Missing facts give
    "needs_information", never a guess. This is a check against cited rules, not a sanction decision."""
    result = check_eligibility(pack_for(body.state, body.scheme, body.on), body.facts)
    return {
        **result,
        "disclaimer": "Checked against the cited rule pack. Only the scheme authority can sanction a house.",
    }


@router.get("/clauses/{clause_id}")
def clause(clause_id: str, user=Depends(current_user)):
    """One clause with its text in English and Kannada and its source, for citations in the UI."""
    state = clause_id.split("-", 1)[0]
    pack = pack_for(state)
    found = pack.clause(clause_id)
    if not found:
        raise HTTPException(status_code=404, detail="Clause not found in the pack in force")
    return {"pack_id": pack.pack_id, **found}
