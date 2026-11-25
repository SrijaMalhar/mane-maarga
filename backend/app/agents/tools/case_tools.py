"""The tools a model may call. Code computes every rule and rupee; tools only return results.

None of these tools change a case's status or money. The one tool that proposes such a change,
request_approval, creates a pending row for a person to decide.
"""

from __future__ import annotations

import json
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

from ...engine import affordability as aff
from ...engine.ladder import build_ladder
from ...engine.rules import check_eligibility as run_eligibility
from ...engine.rules import load_pack
from ...models import (
    ApprovalRequest,
    Case,
    CaseDocument,
    CaseFundingSource,
    ConstructionStage,
    DocumentExtraction,
    RecoveryTask,
)
from ...schemas import Status
from ..specialists import _document_agent
from .registry import ToolContext, ToolError, tool

Lang = Literal["en", "kn"]


def _case(ctx: ToolContext, case_id: int) -> Case:
    case = ctx.db.get(Case, case_id)
    if case is None:
        raise ToolError("case_not_found", f"Case {case_id} does not exist")
    return case


def _pack(state: str = "KA", on: date | None = None):
    try:
        return load_pack(state=state.upper(), on=on or date.today())
    except LookupError as exc:
        raise ToolError("no_rule_pack", str(exc)) from exc


class CaseRef(BaseModel):
    case_id: int = Field(gt=0)


# --- get_case --------------------------------------------------------------------------------


class CaseSummary(BaseModel):
    case_id: int
    beneficiary_name: str
    village: str
    taluk: str
    status: str
    consent_status: str
    estimated_cost: float
    sanctioned_amount: float
    confirmed_funding: float
    proposed_funding: float
    stage_count: int
    open_tasks: int
    pending_approvals: int


@tool(
    "get_case",
    "Read one case: who, where, status, consent, cost, and money confirmed versus proposed.",
    CaseRef,
    CaseSummary,
    "none",
)
def get_case(ctx: ToolContext, a: CaseRef) -> CaseSummary:
    c = _case(ctx, a.case_id)
    funding = ctx.db.query(CaseFundingSource).filter(CaseFundingSource.case_id == c.id).all()
    return CaseSummary(
        case_id=c.id,
        beneficiary_name=c.beneficiary_name,
        village=c.village,
        taluk=c.taluk,
        status=c.status,
        consent_status=c.consent_status,
        estimated_cost=float(c.estimated_cost or 0),
        sanctioned_amount=float(c.sanctioned_amount or 0),
        confirmed_funding=sum(float(f.amount) for f in funding if f.status in ("confirmed", "received")),
        proposed_funding=sum(float(f.amount) for f in funding if f.status == "proposed"),
        stage_count=ctx.db.query(ConstructionStage).filter(ConstructionStage.case_id == c.id).count(),
        open_tasks=ctx.db.query(RecoveryTask)
        .filter(RecoveryTask.case_id == c.id, RecoveryTask.status == "open")
        .count(),
        pending_approvals=ctx.db.query(ApprovalRequest)
        .filter(ApprovalRequest.case_id == c.id, ApprovalRequest.status == "pending")
        .count(),
    )


# --- list_documents / check_documents ---------------------------------------------------------


class DocumentRow(BaseModel):
    document_id: int
    name: str
    verification_status: str
    extraction_status: str | None
    document_type: str | None


class DocumentList(BaseModel):
    case_id: int
    documents: list[DocumentRow]


def _docs(ctx: ToolContext, case_id: int):
    docs = ctx.db.query(CaseDocument).filter(CaseDocument.case_id == case_id).all()
    ext = (
        ctx.db.query(DocumentExtraction).filter(DocumentExtraction.document_id.in_([d.id for d in docs])).all()
        if docs
        else []
    )
    return docs, ext


@tool(
    "list_documents", "List a case's documents with verification and extraction status.", CaseRef, DocumentList, "none"
)
def list_documents(ctx: ToolContext, a: CaseRef) -> DocumentList:
    _case(ctx, a.case_id)
    docs, ext = _docs(ctx, a.case_id)
    by_doc = {e.document_id: e for e in ext}
    return DocumentList(
        case_id=a.case_id,
        documents=[
            DocumentRow(
                document_id=d.id,
                name=d.original_name,
                verification_status=d.verification_status,
                extraction_status=by_doc[d.id].extraction_status if d.id in by_doc else None,
                document_type=by_doc[d.id].document_type if d.id in by_doc else None,
            )
            for d in docs
        ],
    )


class DocumentCheck(BaseModel):
    case_id: int
    status: Literal["attention_required", "no_action"]
    document_count: int
    not_extracted: list[str]
    review_required: list[str]
    mismatches: list[dict]


@tool(
    "check_documents",
    "Find documents not yet extracted, needing review, or with field mismatches.",
    CaseRef,
    DocumentCheck,
    "none",
)
def check_documents(ctx: ToolContext, a: CaseRef) -> DocumentCheck:
    _case(ctx, a.case_id)
    docs, ext = _docs(ctx, a.case_id)
    result = _document_agent(docs, ext)
    names = {d.id: d.original_name for d in docs}
    mismatches = [
        {"document": names[e.document_id], **chk}
        for e in ext
        for chk in json.loads(e.checks_json or "[]")
        if isinstance(chk, dict) and chk.get("status") == "mismatch"
    ]
    f = result["findings"]
    return DocumentCheck(
        case_id=a.case_id,
        status=result["status"],
        document_count=f["document_count"],
        not_extracted=f["not_extracted"],
        review_required=f["review_required"],
        mismatches=mismatches,
    )


# --- check_eligibility ------------------------------------------------------------------------


class EligibilityArgs(BaseModel):
    case_id: int | None = Field(default=None, gt=0)
    state: str = Field("KA", min_length=2, max_length=2)
    facts: dict[str, bool | int | float | str | None] = Field(default_factory=dict)


class EligibilityResult(BaseModel):
    pack_id: str
    verdict: Literal["eligible", "not_eligible", "needs_information"]
    failed: list[dict]
    unknown: list[dict]
    missing_facts: list[str]
    clause_ids: list[str]
    unverified_clauses_used: list[str]


@tool(
    "check_eligibility",
    "Check PMAY-G eligibility and exclusion rules in code. Missing facts give needs_information, never a guess.",
    EligibilityArgs,
    EligibilityResult,
    "none",
)
def check_eligibility(ctx: ToolContext, a: EligibilityArgs) -> EligibilityResult:
    if a.case_id:
        _case(ctx, a.case_id)
    out = run_eligibility(_pack(a.state), a.facts)
    return EligibilityResult(**{k: out[k] for k in EligibilityResult.model_fields})


# --- build_money_ladder / assess_affordability ------------------------------------------------


class LadderArgs(BaseModel):
    case_id: int = Field(gt=0)
    total_cost: float | None = Field(default=None, gt=0, le=100_000_000)
    own_savings: float = Field(0, ge=0, le=100_000_000)
    scheme_loan: float = Field(0, ge=0, le=100_000_000)
    extra_grants: float = Field(0, ge=0, le=100_000_000)


class LadderResult(BaseModel):
    case_id: int
    pack_id: str
    total_cost: float
    funding_gap: float
    peak_timing_gap: float
    peak_cash_before_instalment: float
    rungs: list[dict]
    stages_verified: bool
    assumptions: list[str]
    citations: list[str]


@tool(
    "build_money_ladder",
    "Stage-by-stage cash needed before each instalment, the largest timing gap and the funding gap.",
    LadderArgs,
    LadderResult,
    "none",
)
def build_money_ladder(ctx: ToolContext, a: LadderArgs) -> LadderResult:
    c = _case(ctx, a.case_id)
    cost = a.total_cost or float(c.estimated_cost or 0)
    if cost <= 0:
        raise ToolError("missing_cost_estimate", "The case has no cost estimate; record one or pass total_cost")
    pack = _pack()
    out = build_ladder(pack, cost, a.own_savings, a.scheme_loan, a.extra_grants)
    return LadderResult(
        case_id=c.id,
        pack_id=pack.pack_id,
        total_cost=cost,
        funding_gap=out["funding_gap"],
        peak_timing_gap=out["peak_timing_gap"],
        peak_cash_before_instalment=max(r["cash_gap_before_instalment"] for r in out["rungs"]),
        rungs=out["rungs"],
        stages_verified=pack.stages_verified,
        assumptions=pack.assumptions,
        citations=[pack.amount_clause("unit_assistance"), pack.amount_clause("scheme_loan_max")],
    )


class LoanArg(BaseModel):
    name: str = Field(max_length=80)
    principal: float = Field(ge=0, le=100_000_000)
    rate_pa: float = Field(ge=0, le=1)
    months: int = Field(gt=0, le=360)


class AffordabilityArgs(BaseModel):
    case_id: int | None = Field(default=None, gt=0)
    monthly_income: list[float] = Field(min_length=1, max_length=24)
    existing_loans: list[LoanArg] = Field(default_factory=list, max_length=20)
    requested: float = Field(gt=0, le=100_000_000)
    rate_pa: float = Field(ge=0, le=1)
    months: int = Field(gt=0, le=360)


class AffordabilityOut(BaseModel):
    income: float
    cap_amount: float
    existing_emi: float
    headroom: float
    max_new_loan: float
    approved_new_loan: float
    no_loan_path: bool
    notes: list[str]


@tool(
    "assess_affordability",
    "Size a loan so all repayments stay within 30% of conservative monthly income. Indicative, not a credit decision.",
    AffordabilityArgs,
    AffordabilityOut,
    "none",
)
def assess_affordability(ctx: ToolContext, a: AffordabilityArgs) -> AffordabilityOut:
    if a.case_id:
        _case(ctx, a.case_id)
    loans = [aff.Loan(**loan.model_dump()) for loan in a.existing_loans]
    r = aff.assess(a.monthly_income, loans, a.requested, a.rate_pa, a.months)
    return AffordabilityOut(**r.__dict__)


# --- plan_land_route (stub) -------------------------------------------------------------------


class LandArgs(BaseModel):
    case_id: int = Field(gt=0)
    has_own_land: bool | None = None
    land_document: str | None = Field(default=None, max_length=80)


class LandRoute(BaseModel):
    case_id: int
    status: Literal["not_needed", "needs_information", "not_available"]
    steps: list[str]
    clause_ids: list[str]


@tool(
    "plan_land_route",
    "For landless families: the route to a site. Stub until Karnataka's land rules are added to the pack.",
    LandArgs,
    LandRoute,
    "none",
)
def plan_land_route(ctx: ToolContext, a: LandArgs) -> LandRoute:
    _case(ctx, a.case_id)
    pack = _pack()
    if a.has_own_land is None:
        return LandRoute(
            case_id=a.case_id, status="needs_information", steps=["Ask whether the family owns a site."], clause_ids=[]
        )
    if a.has_own_land:
        return LandRoute(case_id=a.case_id, status="not_needed", steps=[], clause_ids=[])
    clauses = [c["id"] for c in pack.raw["land_route"]]
    return LandRoute(
        case_id=a.case_id,
        status="not_available" if not clauses else "needs_information",
        steps=["Land-route rules are not yet in the rule pack. Refer the family to the gram panchayat for a site."],
        clause_ids=clauses,
    )


# --- create_task ------------------------------------------------------------------------------


class TaskArgs(BaseModel):
    case_id: int = Field(gt=0)
    title: str = Field(min_length=2, max_length=200)
    category: Literal["document", "scheme", "finance", "construction", "follow_up", "other"] = "follow_up"
    description: str = Field(default="", max_length=3000)
    due_date: date | None = None
    owner: str = Field(default="", max_length=120)


class TaskOut(BaseModel):
    task_id: int
    case_id: int
    title: str
    status: str


@tool("create_task", "Add a follow-up task to a case. Changes no status or money.", TaskArgs, TaskOut, "write")
def create_task(ctx: ToolContext, a: TaskArgs) -> TaskOut:
    _case(ctx, a.case_id)
    task = RecoveryTask(
        case_id=a.case_id,
        title=a.title,
        category=a.category,
        description=a.description,
        due_date=datetime.combine(a.due_date, datetime.min.time()) if a.due_date else None,
        owner=a.owner,
        created_by=ctx.actor,
    )
    ctx.db.add(task)
    ctx.db.flush()
    return TaskOut(task_id=task.id, case_id=a.case_id, title=task.title, status=task.status)


# --- draft_message ----------------------------------------------------------------------------

TEMPLATES: dict[str, dict[str, str]] = {
    "document_request": {
        "en": "Namaskara {name}. To move your house file forward, please bring: {items}. Contact the panchayat office.",
        "kn": "ನಮಸ್ಕಾರ {name}. ನಿಮ್ಮ ಮನೆ ಕಡತ ಮುಂದುವರಿಯಲು ದಯವಿಟ್ಟು ಇವುಗಳನ್ನು ತನ್ನಿ: {items}. ಪಂಚಾಯತ್ ಕಚೇರಿಯನ್ನು ಸಂಪರ್ಕಿಸಿ.",
    },
    "stage_visit": {
        "en": "Namaskara {name}. An officer will visit to verify the {items} stage. Please keep the site open.",
        "kn": "ನಮಸ್ಕಾರ {name}. {items} ಹಂತವನ್ನು ಪರಿಶೀಲಿಸಲು ಅಧಿಕಾರಿ ಭೇಟಿ ನೀಡುತ್ತಾರೆ. ದಯವಿಟ್ಟು ಸ್ಥಳದಲ್ಲಿ ಇರಿ.",
    },
    "cash_needed": {
        "en": "Namaskara {name}. Before the next instalment you will need about {items}. Let us plan it together.",
        "kn": "ನಮಸ್ಕಾರ {name}. ಮುಂದಿನ ಕಂತಿಗೆ ಮೊದಲು ನಿಮಗೆ ಸುಮಾರು {items} ಬೇಕಾಗುತ್ತದೆ. ಒಟ್ಟಿಗೆ ಯೋಜನೆ ಮಾಡೋಣ.",
    },
}


class DraftArgs(BaseModel):
    case_id: int = Field(gt=0)
    kind: Literal["document_request", "stage_visit", "cash_needed"]
    items: str = Field(min_length=1, max_length=300)
    language: Lang = "kn"


class DraftOut(BaseModel):
    case_id: int
    language: Lang
    text: str
    sent: bool = False


@tool(
    "draft_message",
    "Draft a short message to the family in Kannada or English from a fixed template. It is never sent by a tool.",
    DraftArgs,
    DraftOut,
    "none",
)
def draft_message(ctx: ToolContext, a: DraftArgs) -> DraftOut:
    c = _case(ctx, a.case_id)
    first = c.beneficiary_name.split()[0]
    return DraftOut(
        case_id=c.id, language=a.language, text=TEMPLATES[a.kind][a.language].format(name=first, items=a.items)
    )


# --- request_approval -------------------------------------------------------------------------


class ApprovalArgs(BaseModel):
    case_id: int = Field(gt=0)
    action: Literal["case_status_change", "financial_offer", "payment", "submission"]
    new_status: Status | None = None
    amount: float | None = Field(default=None, ge=0, le=100_000_000)
    reason: str = Field(min_length=5, max_length=2000)
    citations: list[str] = Field(default_factory=list, max_length=20)


class ApprovalOut(BaseModel):
    approval_id: int
    case_id: int
    action: str
    status: Literal["pending"]
    message: str


@tool(
    "request_approval",
    "Propose a status change, offer, payment or submission. Creates a pending request only; a person decides.",
    ApprovalArgs,
    ApprovalOut,
    "gated",
)
def request_approval(ctx: ToolContext, a: ApprovalArgs) -> ApprovalOut:
    _case(ctx, a.case_id)
    if a.action == "case_status_change" and a.new_status is None:
        raise ToolError("invalid_arguments", "case_status_change needs new_status")
    req = ApprovalRequest(
        case_id=a.case_id,
        action=a.action,
        payload_json=json.dumps({"new_status": a.new_status, "amount": a.amount}),
        reason=a.reason,
        citations_json=json.dumps(a.citations),
        requested_by=ctx.actor,
    )
    ctx.db.add(req)
    ctx.db.flush()
    return ApprovalOut(
        approval_id=req.id,
        case_id=a.case_id,
        action=a.action,
        status="pending",
        message="Waiting for an administrator. Nothing has changed on the case.",
    )


# --- get_rule_clause --------------------------------------------------------------------------


class ClauseArgs(BaseModel):
    clause_id: str = Field(min_length=5, max_length=60)


class ClauseOut(BaseModel):
    clause_id: str
    pack_id: str
    text_en: str
    text_kn: str
    verified: bool
    value: float | None = None
    source: dict


@tool(
    "get_rule_clause",
    "Read one cited clause from the rule pack in force, in English and Kannada.",
    ClauseArgs,
    ClauseOut,
    "none",
)
def get_rule_clause(ctx: ToolContext, a: ClauseArgs) -> ClauseOut:
    pack = _pack(a.clause_id.split("-", 1)[0])
    c = pack.clause(a.clause_id)
    if c is None:
        raise ToolError("clause_not_found", f"{a.clause_id} is not in {pack.pack_id}")
    return ClauseOut(
        clause_id=c["id"],
        pack_id=pack.pack_id,
        text_en=c["text_en"],
        text_kn=c["text_kn"],
        verified=c["verified"],
        value=c.get("value"),
        source=c["source"],
    )
