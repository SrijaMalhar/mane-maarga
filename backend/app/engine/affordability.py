"""Affordability: total repayments, all loans counted, capped at 30% of monthly income."""
from __future__ import annotations
from dataclasses import dataclass, field

CAP = 0.30  # stricter than RBI's 50% microfinance cap


def emi(principal: float, rate_pa: float, months: int) -> float:
    if principal <= 0:
        return 0.0
    r = rate_pa / 12
    if r == 0:
        return principal / months
    return principal * r / (1 - (1 + r) ** -months)


def max_principal(monthly_emi: float, rate_pa: float, months: int) -> float:
    if monthly_emi <= 0:
        return 0.0
    r = rate_pa / 12
    if r == 0:
        return monthly_emi * months
    return monthly_emi * (1 - (1 + r) ** -months) / r


def conservative_income(monthly_income: list[float]) -> float:
    """Irregular income: mean of the lowest 3/4 of months, so lean months are not ignored."""
    if not monthly_income:
        raise ValueError("income history required")
    xs = sorted(monthly_income)
    k = max(1, round(len(xs) * 0.75))
    return sum(xs[:k]) / k


@dataclass
class Loan:
    name: str
    principal: float
    rate_pa: float
    months: int

    @property
    def emi(self) -> float:
        return emi(self.principal, self.rate_pa, self.months)


@dataclass
class AffordabilityResult:
    income: float
    cap_amount: float
    existing_emi: float
    headroom: float
    max_new_loan: float
    approved_new_loan: float
    no_loan_path: bool
    notes: list[str] = field(default_factory=list)


def assess(monthly_income: list[float], existing_loans: list[Loan], requested: float,
           rate_pa: float, months: int) -> AffordabilityResult:
    """existing_loans must include any PMAY-G scheme loan the family has taken or will take."""
    income = conservative_income(monthly_income)
    cap = income * CAP
    existing = sum(l.emi for l in existing_loans)
    headroom = max(0.0, cap - existing)
    max_new = max_principal(headroom, rate_pa, months)
    approved = min(requested, max_new)
    notes = []
    if requested > max_new:
        notes.append("Requested loan exceeds the 30% cap; sized down. Offer the no-loan path (phase the build).")
    if existing >= cap:
        notes.append("Existing repayments already at or above the cap; no new loan.")
    return AffordabilityResult(income, cap, existing, headroom, max_new, approved,
                               no_loan_path=approved < requested)
