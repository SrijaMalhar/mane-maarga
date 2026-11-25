"""Funding sources, the finance summary, the indicative budget plan and the scheme catalogue."""

import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..core.audit import write_audit
from ..core.security import (
    Authenticated,
    Operator,
)
from ..database import get_db
from ..models import (
    BudgetPlan,
    Case,
    CaseDocument,
    CaseFundingSource,
    ConstructionStage,
)
from ..schemas import (
    FundingCreate,
    FundingOut,
)

router = APIRouter()


# Discovery aid, not an eligibility decision. Rules must be verified against current official
# notifications for the beneficiary's state and year.
SCHEME_CATALOG = [
    {
        "code": "PMAY_G",
        "name": "Pradhan Mantri Awaas Yojana-Gramin",
        "jurisdiction": "central",
        "status": "reference_only",
        "official_url": "https://pmayg.nic.in/",
        "note": "Check current beneficiary status, assistance, convergence and any institutional loan with official records.",
    },
    {
        "code": "PMAY_U_2_BLC",
        "name": "PMAY-Urban 2.0 - Beneficiary Led Construction",
        "jurisdiction": "central",
        "status": "reference_only",
        "official_url": "https://pmay-urban.gov.in/",
        "note": "Urban-only pathway; eligibility and assistance require current official verification.",
    },
    {
        "code": "BASAVA_VASATI",
        "name": "Basava Vasati Yojana",
        "jurisdiction": "Karnataka",
        "status": "reference_only",
        "official_url": "https://ashraya.karnataka.gov.in/",
        "note": "Do not infer eligibility; confirm current state rules and beneficiary records.",
    },
    {
        "code": "AMBEDKAR_NIVAS",
        "name": "Dr. B. R. Ambedkar Nivas Yojana",
        "jurisdiction": "Karnataka",
        "status": "reference_only",
        "official_url": "https://ashraya.karnataka.gov.in/",
        "note": "Do not infer eligibility; confirm current state rules and beneficiary records.",
    },
]


@router.get("/api/schemes")
def list_scheme_catalog(user: Authenticated):
    return {
        "schemes": SCHEME_CATALOG,
        "disclaimer": "Reference catalog only. No eligibility is calculated and rules may change.",
    }


@router.post("/api/cases/{case_id}/funding", response_model=FundingOut, status_code=201)
def add_funding_source(case_id: int, payload: FundingCreate, user: Operator, db: Session = Depends(get_db)):
    case = db.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    if payload.evidence_document_id is not None:
        document = db.get(CaseDocument, payload.evidence_document_id)
        if not document or document.case_id != case_id:
            raise HTTPException(status_code=422, detail="Evidence document must belong to this case")
    if payload.scheme_code and payload.reference_number and (payload.status in {"confirmed", "received"}):
        duplicate = (
            db.query(CaseFundingSource)
            .filter(
                CaseFundingSource.case_id == case_id,
                CaseFundingSource.scheme_code == payload.scheme_code,
                CaseFundingSource.reference_number == payload.reference_number,
                CaseFundingSource.status.in_(["confirmed", "received"]),
            )
            .first()
        )
        if duplicate:
            raise HTTPException(
                status_code=409, detail="This scheme/reference is already recorded as confirmed or received"
            )
    source = CaseFundingSource(case_id=case_id, created_by=user.username, **payload.model_dump())
    db.add(source)
    db.flush()
    write_audit(
        db,
        "funding_source_added",
        case_id,
        f"source_id={source.id}; type={source.source_type}; status={source.status}; amount={source.amount}",
        user.username,
    )
    db.commit()
    db.refresh(source)
    return source


@router.get("/api/cases/{case_id}/funding", response_model=list[FundingOut])
def list_funding_sources(case_id: int, user: Authenticated, db: Session = Depends(get_db)):
    if not db.get(Case, case_id):
        raise HTTPException(status_code=404, detail="Case not found")
    return (
        db.query(CaseFundingSource)
        .filter(CaseFundingSource.case_id == case_id)
        .order_by(CaseFundingSource.created_at.desc())
        .all()
    )


@router.get("/api/cases/{case_id}/finance-summary")
def finance_summary(case_id: int, user: Authenticated, db: Session = Depends(get_db)):
    case = db.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    sources = db.query(CaseFundingSource).filter(CaseFundingSource.case_id == case_id).all()
    stages = (
        db.query(ConstructionStage)
        .filter(ConstructionStage.case_id == case_id)
        .order_by(ConstructionStage.id.asc())
        .all()
    )
    confirmed = sum(float(x.amount) for x in sources if x.status in {"confirmed", "received"})
    received = sum(float(x.amount) for x in sources if x.status == "received")
    proposed = sum(float(x.amount) for x in sources if x.status == "proposed")
    # The legacy sanctioned_amount counts only when no detailed confirmed or received source exists.
    legacy = float(case.sanctioned_amount or 0) if confirmed == 0 else 0.0
    committed = confirmed + legacy
    gap = max(0.0, float(case.estimated_cost or 0) - committed)
    cumulative_cost = 0.0
    stage_rows = []
    for stage in stages:
        cumulative_cost += float(stage.planned_cost)
        stage_rows.append(
            {
                "id": stage.id,
                "stage_code": stage.stage_code,
                "stage_name": stage.stage_name,
                "planned_cost": float(stage.planned_cost),
                "cumulative_cost": cumulative_cost,
                "cash_received": received,
                "cash_shortfall_before_stage": max(0.0, cumulative_cost - received),
                "status": stage.status,
            }
        )
    warnings = []
    if case.existing_loan:
        warnings.append(
            "Existing household loan is shown as a liability; do not treat it as construction funding unless its disbursement is explicitly verified."
        )
    if proposed:
        warnings.append("Proposed funding is not counted toward confirmed funds or affordability.")
    if legacy:
        warnings.append(
            "Legacy sanctioned_amount is counted as confirmed funding because no detailed confirmed/received source exists. Reconcile to documents to avoid double counting."
        )
    if committed > float(case.estimated_cost or 0):
        warnings.append("Recorded confirmed funding exceeds estimated cost; verify duplicate or restricted sources.")
    return {
        "case_id": case_id,
        "estimated_cost": float(case.estimated_cost or 0),
        "funding_confirmed": committed,
        "funding_received": received,
        "funding_proposed": proposed,
        "funding_gap": gap,
        "existing_loans": float(case.existing_loan or 0),
        "stages": stage_rows,
        "warnings": warnings,
        "eligibility": "NOT_ASSESSED",
        "finance_recommendation": "NOT_GENERATED",
    }


class BudgetRequest(BaseModel):
    built_up_sqft: float = Field(gt=100, le=10000)
    quality_tier: str = Field(default="standard", pattern="^(basic|standard|improved)$")
    contingency_percent: float = Field(default=8, ge=0, le=25)
    labor_percent: float = Field(default=35, ge=10, le=70)
    materials_percent: float = Field(default=55, ge=10, le=80)
    other_percent: float = Field(default=10, ge=0, le=40)


@router.post("/api/cases/{case_id}/budget-plan")
def create_budget_plan(case_id: int, payload: BudgetRequest, user: Operator, db: Session = Depends(get_db)):
    case = db.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    rates = {"basic": 1450, "standard": 1850, "improved": 2350}
    base = payload.built_up_sqft * rates[payload.quality_tier]
    contingency = base * payload.contingency_percent / 100
    total = base + contingency
    percentages = [payload.labor_percent, payload.materials_percent, payload.other_percent]
    if abs(sum(percentages) - 100) > 0.01:
        raise HTTPException(status_code=422, detail="Labor, materials and other percentages must total 100")
    sources = db.query(CaseFundingSource).filter(CaseFundingSource.case_id == case_id).all()
    confirmed = sum(float(s.amount) for s in sources if s.status in {"confirmed", "received"})
    proposed = sum(float(s.amount) for s in sources if s.status == "proposed")
    plan = {
        "inputs": payload.model_dump(),
        "assumptions": {
            "indicative_cost_per_sqft": rates[payload.quality_tier],
            "currency": "INR",
            "rates_are_user-editable_reference_estimates": True,
        },
        "base_cost": round(base, 2),
        "contingency": round(contingency, 2),
        "estimated_total": round(total, 2),
        "allocation": {
            "labor": round(base * payload.labor_percent / 100, 2),
            "materials": round(base * payload.materials_percent / 100, 2),
            "other": round(base * payload.other_percent / 100, 2),
            "contingency": round(contingency, 2),
        },
        "confirmed_funding": round(confirmed, 2),
        "proposed_funding_not_counted": round(proposed, 2),
        "funding_gap": round(max(0, total - confirmed), 2),
        "warnings": [
            "Indicative estimate only; actual costs vary by location, design, material prices and labor.",
            "No loan eligibility, creditworthiness, subsidy eligibility or affordability decision is made.",
            "Proposed funding is excluded from confirmed funding.",
        ],
    }
    record = BudgetPlan(case_id=case_id, plan_json=json.dumps(plan), created_by=user.username)
    db.add(record)
    write_audit(db, "budget_plan_created", case_id, "Indicative budget plan created", user.username)
    db.commit()
    db.refresh(record)
    return {"id": record.id, **plan}


@router.get("/api/cases/{case_id}/budget-plan")
def list_budget_plans(case_id: int, user: Authenticated, db: Session = Depends(get_db)):
    if not db.get(Case, case_id):
        raise HTTPException(status_code=404, detail="Case not found")
    records = (
        db.query(BudgetPlan)
        .filter(BudgetPlan.case_id == case_id)
        .order_by(BudgetPlan.created_at.desc())
        .limit(10)
        .all()
    )
    return [{"id": r.id, **json.loads(r.plan_json), "created_at": r.created_at} for r in records]
