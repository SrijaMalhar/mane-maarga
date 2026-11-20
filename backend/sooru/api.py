"""Thin FastAPI layer over the core modules. All rules and rupees live in the modules, not here."""
from __future__ import annotations
from datetime import date
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from . import affordability as aff
from .budget import budget_band
from .ladder import build_ladder
from .rules import check_eligibility, load_pack

app = FastAPI(title="Sooru", version="0.1.0")


class EligibilityIn(BaseModel):
    state: str = "KA"
    facts: dict


class LadderIn(BaseModel):
    state: str = "KA"
    total_cost: float = Field(gt=0)
    own_savings: float = Field(0, ge=0)
    scheme_loan: float = Field(0, ge=0)
    extra_grants: float = Field(0, ge=0)


class LoanIn(BaseModel):
    name: str
    principal: float
    rate_pa: float
    months: int


class AffordabilityIn(BaseModel):
    monthly_income: list[float] = Field(min_length=1)
    existing_loans: list[LoanIn] = []
    requested: float = Field(gt=0)
    rate_pa: float = Field(ge=0)
    months: int = Field(gt=0)


class BudgetIn(BaseModel):
    quotes: list[float] = Field(min_length=3)


def _pack(state: str):
    try:
        return load_pack(state=state, on=date.today())
    except LookupError as e:
        raise HTTPException(404, str(e))


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/eligibility")
def eligibility(body: EligibilityIn):
    return check_eligibility(_pack(body.state), body.facts)


@app.post("/ladder")
def ladder(body: LadderIn):
    return build_ladder(_pack(body.state), body.total_cost, body.own_savings, body.scheme_loan, body.extra_grants)


@app.post("/affordability")
def affordability(body: AffordabilityIn):
    loans = [aff.Loan(**l.model_dump()) for l in body.existing_loans]
    return aff.assess(body.monthly_income, loans, body.requested, body.rate_pa, body.months).__dict__


@app.post("/budget")
def budget(body: BudgetIn):
    return budget_band(body.quotes)
