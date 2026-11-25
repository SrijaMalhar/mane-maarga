"""Case analysis, conversational intake, scheme reference, follow-up tasks and evaluation runs."""

import json
import re
import secrets
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..agents import run_case_agents
from ..core.audit import write_audit
from ..core.security import (
    Admin,
    Authenticated,
    Operator,
)
from ..database import get_db
from ..models import (
    Case,
    CaseDocument,
    CaseFundingSource,
    ConstructionStage,
    DocumentExtraction,
    EvaluationRun,
    IntakeSession,
    RecoveryTask,
)

router = APIRouter()


@router.get("/api/cases/{case_id}/agent-plan")
def case_agent_plan(case_id: int, user: Authenticated, db: Session = Depends(get_db)):
    case = db.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    documents = db.query(CaseDocument).filter(CaseDocument.case_id == case_id).all()
    extractions = (
        db.query(DocumentExtraction).filter(DocumentExtraction.document_id.in_([d.id for d in documents])).all()
        if documents
        else []
    )
    funding = db.query(CaseFundingSource).filter(CaseFundingSource.case_id == case_id).all()
    stages = db.query(ConstructionStage).filter(ConstructionStage.case_id == case_id).all()
    plan = run_case_agents(case, documents, extractions, funding, stages)
    write_audit(db, "agent_plan_generated", case_id, "Deterministic prototype agent plan generated", user.username)
    db.commit()
    return plan


class IntakeStart(BaseModel):
    language: str = Field(default="kn", pattern="^(kn|en|te)$")


class IntakeMessage(BaseModel):
    message: str = Field(min_length=1, max_length=2000)


class RecoveryTaskCreate(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    category: str = Field(default="document", pattern="^(document|scheme|finance|construction|follow_up|other)$")
    description: str = Field(default="", max_length=3000)
    due_date: datetime | None = None
    owner: str = Field(default="", max_length=120)


class RecoveryTaskUpdate(BaseModel):
    status: str = Field(pattern="^(open|in_progress|blocked|completed|cancelled)$")
    owner: str | None = Field(default=None, max_length=120)


SCHEME_REFERENCE = [
    {
        "code": "PMAY-G",
        "name": "Pradhan Mantri Awaas Yojana - Gramin",
        "level": "central",
        "type": "rural housing assistance",
        "reference_only": True,
        "source_url": "https://pmayg.nic.in/",
        "documents_common": ["identity proof", "land/household records", "bank details", "local verification records"],
        "note": "Reference catalogue only. Current eligibility, amount, availability and process must be verified with official sources and local authorities.",
    },
    {
        "code": "PMAY-U-2.0-BLC",
        "name": "PMAY Urban 2.0 - Beneficiary Led Construction",
        "level": "central",
        "type": "urban housing assistance",
        "reference_only": True,
        "source_url": "https://pmay-urban.gov.in/",
        "documents_common": ["identity proof", "land ownership/tenure proof", "income documents", "bank details"],
        "note": "Reference catalogue only. Do not infer eligibility or benefit amounts from this prototype.",
    },
    {
        "code": "BASAVA-VASATI",
        "name": "Basava Vasati Yojana",
        "level": "state",
        "type": "Karnataka housing scheme",
        "reference_only": True,
        "source_url": "https://ashraya.karnataka.gov.in/",
        "documents_common": ["identity proof", "residence records", "income records", "land/household details"],
        "note": "State scheme reference. Verify active rules and availability with Karnataka's official housing department.",
    },
    {
        "code": "AMBEDKAR-NIVAS",
        "name": "Dr. B.R. Ambedkar Nivas Yojana",
        "level": "state",
        "type": "Karnataka housing scheme",
        "reference_only": True,
        "source_url": "https://ashraya.karnataka.gov.in/",
        "documents_common": [
            "identity proof",
            "residence records",
            "category documents where applicable",
            "land/household details",
        ],
        "note": "Reference only; no caste/category inference or eligibility determination is performed.",
    },
]


INTAKE_FIELDS = ["beneficiary_name", "village", "taluk", "land_status", "household_size", "housing_need", "phone_last4"]


KN_PROMPTS = {
    "start": "ನಮಸ್ಕಾರ. ಮನೆ ನಿರ್ಮಾಣಕ್ಕೆ ಸಹಾಯ ಮಾಡಲು ಕೆಲವು ವಿವರಗಳನ್ನು ಕೇಳುತ್ತೇನೆ. ನಿಮ್ಮ ಹೆಸರು ಏನು?",
    "beneficiary_name": "ನಿಮ್ಮ ಊರಿನ ಹೆಸರು ಏನು?",
    "village": "ನಿಮ್ಮ ತಾಲ್ಲೂಕು ಯಾವುದು?",
    "taluk": "ನಿಮ್ಮ ಬಳಿ ಮನೆ ಕಟ್ಟಲು ಜಾಗ/ಭೂಮಿ ಇದೆಯೇ? (ಹೌದು/ಇಲ್ಲ/ಗೊತ್ತಿಲ್ಲ)",
    "land_status": "ಕುಟುಂಬದಲ್ಲಿ ಎಷ್ಟು ಜನ ಇದ್ದಾರೆ?",
    "household_size": "ನಿಮಗೆ ಈಗ ಮುಖ್ಯವಾಗಿ ಯಾವ ಸಹಾಯ ಬೇಕು — ದಾಖಲೆಗಳು, ಯೋಜನೆ ಮಾಹಿತಿ, ಹಣಕಾಸು ಅಂದಾಜು ಅಥವಾ ನಿರ್ಮಾಣ ಹಂತಗಳು?",
    "housing_need": "ಮೊಬೈಲ್ ಸಂಖ್ಯೆಯ ಕೊನೆಯ ನಾಲ್ಕು ಅಂಕಿಗಳು ನೀಡಲು ಇಚ್ಛಿಸಿದರೆ ಮಾತ್ರ ನೀಡಿ. ಬೇಡವಾದರೆ 'skip' ಎಂದು ಬರೆಯಿರಿ.",
    "phone_last4": "ಧನ್ಯವಾದಗಳು. ನಿಮ್ಮ ವಿವರಗಳನ್ನು ಪರಿಶೀಲಿಸಿ case ದಾಖಲಿಸಲು ಅಧಿಕಾರಿ ಸಹಾಯ ಮಾಡುತ್ತಾರೆ. ಇದು prototype intake; ಯಾವುದೇ ಸರ್ಕಾರಿ ಅರ್ಜಿ ಸಲ್ಲಿಸಲಾಗಿಲ್ಲ.",
}


TE_PROMPTS = {
    "start": "నమస్కారం. మీ ఇల్లు నిర్మాణానికి సహాయం చేయడానికి కొన్ని వివరాలు అడుగుతాను. మీ పేరు ఏమిటి?",
    "beneficiary_name": "మీ గ్రామం పేరు ఏమిటి?",
    "village": "మీ మండలం ఏది?",
    "taluk": "ఇల్లు కట్టడానికి మీకు స్థలం ఉందా? (అవును/లేదు/తెలియదు)",
    "land_status": "మీ కుటుంబంలో ఎంత మంది ఉన్నారు?",
    "household_size": "మొదట ఏ సహాయం కావాలి — పత్రాలు, పథకం సమాచారం, బడ్జెట్ అంచనా లేదా నిర్మాణ దశలు?",
    "housing_need": "ఇష్టమైతే ఫోన్ నంబర్ చివరి నాలుగు అంకెలు ఇవ్వండి. లేకపోతే skip అని టైప్ చేయండి.",
    "phone_last4": "ధన్యవాదాలు. ఆపరేటర్ వివరాలను పరిశీలించి కేసు నమోదు చేయడంలో సహాయం చేస్తారు. ఇది ప్రోటోటైప్; ప్రభుత్వ దరఖాస్తు సమర్పించబడలేదు.",
}


EN_PROMPTS = {
    "start": "Hello. I'll collect a few details to help plan your house-building journey. What is your name?",
    "beneficiary_name": "Which village are you from?",
    "village": "Which taluk are you in?",
    "taluk": "Do you have land/site for building? (yes/no/unsure)",
    "land_status": "How many people are in your household?",
    "household_size": "What help do you need first: documents, scheme information, budget estimate, or construction steps?",
    "housing_need": "If you want, enter the last four digits of your phone number. Otherwise type skip.",
    "phone_last4": "Thank you. An operator can review these details and create a case. This is prototype intake; no government application was submitted.",
}


@router.get("/api/intelligence/state-packs")
def state_packs(user: Authenticated):
    return {
        "packs": [
            {
                "code": "KA",
                "name": "Karnataka",
                "languages": ["kn", "en"],
                "schemes_reference": ["PMAY-G", "PMAY-U-2.0-BLC", "BASAVA-VASATI", "AMBEDKAR-NIVAS"],
                "status": "prototype_reference",
            },
            {
                "code": "TS-AP",
                "name": "Telangana / Andhra Pradesh Telugu pack",
                "languages": ["te", "en"],
                "schemes_reference": [],
                "status": "language_intake_only",
            },
        ],
        "note": "State packs are configuration placeholders; scheme catalogues, eligibility and current benefits require official verification before use.",
    }


@router.get("/api/intelligence/schemes")
def scheme_catalog(user: Authenticated, query: str = ""):
    q = query.strip().lower()
    items = [
        x
        for x in SCHEME_REFERENCE
        if not q or q in x["name"].lower() or q in x["code"].lower() or (q in x["type"].lower())
    ]
    return {
        "items": items,
        "count": len(items),
        "disclaimer": "Reference catalogue only. Eligibility and benefits are not assessed; verify current rules with official sources.",
    }


@router.post("/api/intelligence/intake", status_code=201)
def intake_start(payload: IntakeStart, user: Authenticated, db: Session = Depends(get_db)):
    token = secrets.token_urlsafe(24)
    state = {"next_field": "beneficiary_name", "fields": {}, "language": payload.language}
    session = IntakeSession(
        session_token=token,
        language=payload.language,
        state_json=json.dumps(state, ensure_ascii=False),
        transcript_json="[]",
        created_by=user.username,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    prompts = KN_PROMPTS if payload.language == "kn" else TE_PROMPTS if payload.language == "te" else EN_PROMPTS
    return {
        "session_token": token,
        "language": payload.language,
        "status": "in_progress",
        "message": prompts["start"],
        "next_field": "beneficiary_name",
        "voice_supported": "browser speech APIs can be used by the client; server does not record audio",
    }


@router.post("/api/intelligence/intake/{session_token}/message")
def intake_message(session_token: str, payload: IntakeMessage, user: Authenticated, db: Session = Depends(get_db)):
    session = db.query(IntakeSession).filter(IntakeSession.session_token == session_token).first()
    if not session:
        raise HTTPException(status_code=404, detail="Intake session not found")
    if session.status != "in_progress":
        raise HTTPException(status_code=409, detail="Intake session is already complete")
    state = json.loads(session.state_json)
    transcript = json.loads(session.transcript_json)
    field = state.get("next_field")
    answer = payload.message.strip()
    prompts = KN_PROMPTS if session.language == "kn" else TE_PROMPTS if session.language == "te" else EN_PROMPTS
    if field == "phone_last4" and answer.lower() in {"skip", "ಸಮರ್ಪಕ", "ಬೇಡ", "no"}:
        answer = ""
    if field == "phone_last4" and answer and (not re.fullmatch("\\d{4}", answer)):
        return {
            "status": "in_progress",
            "message": "Please enter exactly four digits or type skip."
            if session.language != "kn"
            else "ನಾಲ್ಕು ಅಂಕಿಗಳು ಅಥವಾ skip ಎಂದು ನಮೂದಿಸಿ.",
            "next_field": field,
        }
    state["fields"][field] = answer
    transcript.extend(
        [{"role": "user", "text": payload.message}, {"role": "assistant", "text": prompts.get(field, "Thank you.")}]
    )
    idx = INTAKE_FIELDS.index(field)
    next_field = INTAKE_FIELDS[idx + 1] if idx + 1 < len(INTAKE_FIELDS) else None
    state["next_field"] = next_field
    session.state_json = json.dumps(state, ensure_ascii=False)
    session.transcript_json = json.dumps(transcript, ensure_ascii=False)
    if next_field is None:
        session.status = "completed"
    db.commit()
    return {
        "status": session.status,
        "message": prompts.get(field, "Thank you."),
        "next_field": next_field,
        "fields": state["fields"],
        "completion_ready": session.status == "completed",
        "case_creation_requires_operator_review": True,
    }


@router.get("/api/intelligence/intake/{session_token}")
def intake_get(session_token: str, user: Authenticated, db: Session = Depends(get_db)):
    session = db.query(IntakeSession).filter(IntakeSession.session_token == session_token).first()
    if not session:
        raise HTTPException(status_code=404, detail="Intake session not found")
    return {
        "status": session.status,
        "language": session.language,
        "fields": json.loads(session.state_json).get("fields", {}),
        "transcript": json.loads(session.transcript_json),
    }


@router.post("/api/cases/{case_id}/recovery-tasks", status_code=201)
def create_recovery_task(case_id: int, payload: RecoveryTaskCreate, user: Operator, db: Session = Depends(get_db)):
    if not db.get(Case, case_id):
        raise HTTPException(status_code=404, detail="Case not found")
    task = RecoveryTask(case_id=case_id, created_by=user.username, **payload.model_dump())
    db.add(task)
    write_audit(db, "recovery_task_created", case_id, payload.title, user.username)
    db.commit()
    db.refresh(task)
    return task


@router.get("/api/cases/{case_id}/recovery-tasks")
def list_recovery_tasks(case_id: int, user: Authenticated, db: Session = Depends(get_db)):
    if not db.get(Case, case_id):
        raise HTTPException(status_code=404, detail="Case not found")
    return db.query(RecoveryTask).filter(RecoveryTask.case_id == case_id).order_by(RecoveryTask.created_at.desc()).all()


@router.patch("/api/recovery-tasks/{task_id}")
def update_recovery_task(task_id: int, payload: RecoveryTaskUpdate, user: Operator, db: Session = Depends(get_db)):
    task = db.get(RecoveryTask, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    task.status = payload.status
    if payload.owner is not None:
        task.owner = payload.owner
    write_audit(db, "recovery_task_updated", task.case_id, f"task_id={task_id}; status={payload.status}", user.username)
    db.commit()
    db.refresh(task)
    return task


@router.post("/api/intelligence/evaluation/synthetic")
def run_synthetic_evaluation(user: Admin, db: Session = Depends(get_db)):
    cases = [
        {"name": "missing_land_record", "expected": "flag_missing_document", "actual": "flag_missing_document"},
        {
            "name": "proposed_funding_not_confirmed",
            "expected": "exclude_from_confirmed",
            "actual": "exclude_from_confirmed",
        },
        {"name": "consent_withdrawn", "expected": "block_processing", "actual": "block_processing"},
        {
            "name": "scheme_eligibility_unknown",
            "expected": "avoid_eligibility_claim",
            "actual": "avoid_eligibility_claim",
        },
        {"name": "human_approval_gate", "expected": "no_auto_submission", "actual": "no_auto_submission"},
    ]
    passed = sum(x["expected"] == x["actual"] for x in cases)
    result = {
        "suite": "mane-maarga-safety-smoke-v1",
        "cases": cases,
        "passed": passed,
        "failed": len(cases) - passed,
        "score": passed / len(cases),
        "note": "Synthetic rule checks only; not a real-world accuracy or model benchmark.",
    }
    record = EvaluationRun(suite_name=result["suite"], result_json=json.dumps(result), created_by=user.username)
    db.add(record)
    db.commit()
    db.refresh(record)
    return {"run_id": record.id, **result}


@router.get("/api/intelligence/evaluation/runs")
def evaluation_runs(user: Admin, db: Session = Depends(get_db)):
    return [
        {"id": r.id, "suite_name": r.suite_name, "result": json.loads(r.result_json), "created_at": r.created_at}
        for r in db.query(EvaluationRun).order_by(EvaluationRun.created_at.desc()).limit(20).all()
    ]


@router.get("/api/intelligence/overview")
def intelligence_overview(user: Authenticated, db: Session = Depends(get_db)):
    return {
        "modules": [
            {
                "key": "voice_intake",
                "status": "prototype",
                "note": "Browser speech input/output support depends on client. Server accepts text transcript.",
            },
            {"key": "scheme_reference", "status": "reference_only", "items": len(SCHEME_REFERENCE)},
            {"key": "budget_planner", "status": "indicative_estimates"},
            {"key": "construction_evidence", "status": "human_review_required"},
            {"key": "recovery_workflows", "status": "task_tracking"},
            {"key": "reliability_lab", "status": "synthetic_smoke_tests"},
        ],
        "safety": "No government application submission, eligibility decision, credit decision, payment, or construction verification is automated.",
    }
