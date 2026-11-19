from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import text, inspect
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import Annotated
import os, re, json, hmac, hashlib, base64, secrets
from .database import Base, engine, get_db
from .models import Case, ConsentRecord, AuditLog, User, CaseDocument, CaseFundingSource, ConstructionStage, DocumentExtraction, IntakeSession, BudgetPlan, ConstructionEvidence, RecoveryTask, EvaluationRun
from .document_ai import extract_document, extract_fields, compare_case
from .agents import run_case_agents
from .schemas import CaseCreate, CaseUpdate, CaseOut, ConsentCreate, ConsentOut, AuditOut, BootstrapRequest, LoginRequest, UserCreate, UserOut, TokenOut, DocumentOut, FundingCreate, FundingOut, StageCreate, StageOut, StageStatusUpdate, ExtractionOut, ExtractionRequest
from pydantic import BaseModel, Field

Base.metadata.create_all(bind=engine)
def ensure_consent_status_column(database_engine):
    if 'consent_status' not in {column['name'] for column in inspect(database_engine).get_columns('cases')}:
        with database_engine.begin() as conn:
            conn.execute(text("ALTER TABLE cases ADD COLUMN consent_status VARCHAR(20) DEFAULT 'pending'"))
ensure_consent_status_column(engine)

app = FastAPI(title="Sooru API", version="0.8.0")
app.add_middleware(CORSMiddleware, allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173").split(","), allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

UPLOAD_DIR = Path(os.getenv("SOORU_UPLOAD_DIR", "uploads/cases")).resolve()
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
JWT_SECRET = os.getenv("SOORU_JWT_SECRET", "dev-only-change-this-secret-before-deployment").encode()
JWT_TTL_MINUTES = int(os.getenv("SOORU_JWT_TTL_MINUTES", "60"))

# Prototype estimate: subtract only confirmed/sanctioned funding; liabilities remain informational.
def calculate_gap(case):
    return max(0, float(case.estimated_cost or 0) - float(case.sanctioned_amount or 0))

def write_audit(db: Session, action: str, case_id: int | None, detail: str = "", actor: str = "system"):
    db.add(AuditLog(case_id=case_id, actor=actor, action=action, detail=detail))

def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

def _password_hash(password: str) -> str:
    salt = secrets.token_bytes(16)
    rounds = 310_000
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, rounds)
    return f"pbkdf2_sha256${rounds}${_b64(salt)}${_b64(digest)}"

def _verify_password(password: str, stored: str) -> bool:
    try:
        algorithm, rounds, salt, digest = stored.split("$", 3)
        if algorithm != "pbkdf2_sha256": return False
        calculated = hashlib.pbkdf2_hmac("sha256", password.encode(), base64.urlsafe_b64decode(salt + "=" * (-len(salt) % 4)), int(rounds))
        return hmac.compare_digest(_b64(calculated), digest)
    except (ValueError, TypeError):
        return False

def _make_token(user: User) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": str(user.id), "username": user.username, "role": user.role, "iat": int(now.timestamp()), "exp": int((now + timedelta(minutes=JWT_TTL_MINUTES)).timestamp())}
    header = _b64(json.dumps({"alg":"HS256","typ":"JWT"}, separators=(",", ":")).encode())
    body = _b64(json.dumps(payload, separators=(",", ":")).encode())
    signature = _b64(hmac.new(JWT_SECRET, f"{header}.{body}".encode(), hashlib.sha256).digest())
    return f"{header}.{body}.{signature}"

def _decode_token(token: str) -> dict:
    try:
        header, body, signature = token.split(".")
        expected = _b64(hmac.new(JWT_SECRET, f"{header}.{body}".encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(signature, expected): raise ValueError("signature")
        payload = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
        if int(payload.get("exp", 0)) < int(datetime.now(timezone.utc).timestamp()): raise ValueError("expired")
        return payload
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired access token")

def current_user(authorization: Annotated[str | None, Header()] = None, db: Session = Depends(get_db)) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")
    payload = _decode_token(authorization[7:].strip())
    user = db.get(User, int(payload.get("sub", 0)))
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User is inactive or unavailable")
    return user

def require_roles(*roles: str):
    def dependency(user: User = Depends(current_user)):
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return dependency

Admin = Annotated[User, Depends(require_roles("admin"))]
Operator = Annotated[User, Depends(require_roles("admin", "operator"))]
Authenticated = Annotated[User, Depends(current_user)]

@app.get("/health")
def health():
    return {"status": "ok", "service": "sooru-api", "version": "0.8.0"}

@app.get("/api/auth/status")
def auth_status(db: Session = Depends(get_db)):
    return {"bootstrap_required": db.query(User).count() == 0}

@app.post("/api/auth/bootstrap", response_model=TokenOut, status_code=201)
def bootstrap_admin(payload: BootstrapRequest, db: Session = Depends(get_db)):
    if db.query(User).count() != 0:
        raise HTTPException(status_code=409, detail="Bootstrap is already complete")
    user = User(username=payload.username.strip(), email=payload.email.strip().lower(), password_hash=_password_hash(payload.password), role="admin", is_active=True)
    db.add(user); db.commit(); db.refresh(user)
    return {"access_token": _make_token(user), "token_type":"bearer", "user":user}

@app.post("/api/auth/login", response_model=TokenOut)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == payload.username).first()
    if not user or not _verify_password(payload.password, user.password_hash) or not user.is_active:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return {"access_token":_make_token(user), "token_type":"bearer", "user":user}

@app.get("/api/auth/me", response_model=UserOut)
def me(user: Authenticated):
    return user

@app.post("/api/auth/users", response_model=UserOut, status_code=201)
def create_user(payload: UserCreate, admin: Admin, db: Session = Depends(get_db)):
    if db.query(User).filter((User.username == payload.username) | (User.email == payload.email.lower())).first():
        raise HTTPException(status_code=409, detail="Username or email already exists")
    user = User(username=payload.username.strip(), email=payload.email.strip().lower(), password_hash=_password_hash(payload.password), role=payload.role, is_active=True)
    db.add(user); db.flush(); write_audit(db, "user_created", None, f"username={user.username}; role={user.role}", admin.username); db.commit(); db.refresh(user)
    return user

@app.get("/api/auth/users", response_model=list[UserOut])
def list_users(admin: Admin, db: Session = Depends(get_db)):
    return db.query(User).order_by(User.created_at.desc()).all()

@app.get("/api/cases", response_model=list[CaseOut])
def list_cases(user: Authenticated, db: Session = Depends(get_db)):
    return db.query(Case).order_by(Case.created_at.desc()).all()

@app.post("/api/cases", response_model=CaseOut, status_code=201)
def create_case(payload: CaseCreate, user: Operator, db: Session = Depends(get_db)):
    case = Case(**payload.model_dump()); case.gap_amount = calculate_gap(case)
    db.add(case); db.flush(); write_audit(db, "case_created", case.id, "Beneficiary case created", user.username); db.commit(); db.refresh(case)
    return case

@app.get("/api/cases/{case_id}", response_model=CaseOut)
def get_case(case_id: int, user: Authenticated, db: Session = Depends(get_db)):
    case = db.get(Case, case_id)
    if not case: raise HTTPException(status_code=404, detail="Case not found")
    return case

@app.patch("/api/cases/{case_id}", response_model=CaseOut)
def update_case(case_id: int, payload: CaseUpdate, user: Operator, db: Session = Depends(get_db)):
    case = db.get(Case, case_id)
    if not case: raise HTTPException(status_code=404, detail="Case not found")
    updates = payload.model_dump(exclude_unset=True)
    for key, value in updates.items(): setattr(case, key, value)
    case.gap_amount = calculate_gap(case); write_audit(db, "case_updated", case.id, ",".join(sorted(updates.keys())), user.username); db.commit(); db.refresh(case)
    return case

@app.delete("/api/cases/{case_id}", status_code=204)
def delete_case(case_id: int, admin: Admin, db: Session = Depends(get_db)):
    case = db.get(Case, case_id)
    if not case: raise HTTPException(status_code=404, detail="Case not found")
    for document in db.query(CaseDocument).filter(CaseDocument.case_id == case_id).all():
        file_path = UPLOAD_DIR / str(case_id) / document.stored_name
        if file_path.exists(): file_path.unlink()
        db.delete(document)
    write_audit(db, "case_deleted", case.id, "Beneficiary case deleted", admin.username); db.delete(case); db.commit()

@app.post("/api/cases/{case_id}/consent", response_model=ConsentOut, status_code=201)
def record_consent(case_id: int, payload: ConsentCreate, user: Operator, db: Session = Depends(get_db)):
    case = db.get(Case, case_id)
    if not case: raise HTTPException(status_code=404, detail="Case not found")
    record = ConsentRecord(case_id=case_id, recorded_by=user.username, **payload.model_dump())
    case.consent_status = "given" if payload.consent_given else "withdrawn"
    db.add(record); write_audit(db, "consent_recorded", case_id, f"consent_given={payload.consent_given}; scope={payload.consent_scope}", user.username); db.commit(); db.refresh(record)
    return record

@app.get("/api/cases/{case_id}/consent", response_model=list[ConsentOut])
def consent_history(case_id: int, user: Authenticated, db: Session = Depends(get_db)):
    if not db.get(Case, case_id): raise HTTPException(status_code=404, detail="Case not found")
    return db.query(ConsentRecord).filter(ConsentRecord.case_id == case_id).order_by(ConsentRecord.recorded_at.desc()).all()

@app.post("/api/cases/{case_id}/documents", response_model=DocumentOut, status_code=201)
def upload_document(case_id: int, user: Operator, file: UploadFile = File(...), db: Session = Depends(get_db)):
    case = db.get(Case, case_id)
    if not case: raise HTTPException(status_code=404, detail="Case not found")
    original_name = Path(file.filename or "upload").name[:255]
    ext = Path(original_name).suffix.lower()
    allowed = {".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg"}
    if ext not in allowed: raise HTTPException(status_code=415, detail="Only PDF, PNG, and JPEG files are accepted")
    data = file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES: raise HTTPException(status_code=413, detail="File exceeds 10 MB limit")
    actual = (data.startswith(b"%PDF-") if ext == ".pdf" else data.startswith(b"\x89PNG\r\n\x1a\n") if ext == ".png" else data.startswith(b"\xff\xd8\xff"))
    if not actual: raise HTTPException(status_code=415, detail="File content does not match its extension")
    stored = f"{secrets.token_hex(24)}{ext}"; case_dir = UPLOAD_DIR / str(case_id); case_dir.mkdir(parents=True, exist_ok=True)
    target = case_dir / stored; target.write_bytes(data)
    document = CaseDocument(case_id=case_id, original_name=original_name, stored_name=stored, content_type=allowed[ext], size_bytes=len(data), verification_status="pending", uploaded_by=user.username)
    db.add(document); db.flush(); write_audit(db, "document_uploaded", case_id, f"document_id={document.id}; size={len(data)}", user.username); db.commit(); db.refresh(document)
    return document

@app.get("/api/cases/{case_id}/documents", response_model=list[DocumentOut])
def list_documents(case_id: int, user: Authenticated, db: Session = Depends(get_db)):
    if not db.get(Case, case_id): raise HTTPException(status_code=404, detail="Case not found")
    return db.query(CaseDocument).filter(CaseDocument.case_id == case_id).order_by(CaseDocument.uploaded_at.desc()).all()

@app.get("/api/documents/{document_id}/download")
def download_document(document_id: int, user: Authenticated, db: Session = Depends(get_db)):
    document = db.get(CaseDocument, document_id)
    if not document: raise HTTPException(status_code=404, detail="Document not found")
    path = (UPLOAD_DIR / str(document.case_id) / document.stored_name).resolve()
    if not path.is_relative_to(UPLOAD_DIR): raise HTTPException(status_code=400, detail="Invalid document path")
    if not path.exists(): raise HTTPException(status_code=404, detail="Document file is missing")
    return FileResponse(path, media_type=document.content_type, filename=document.original_name)

@app.post("/api/documents/{document_id}/extract", response_model=ExtractionOut)
def extract_document_fields(document_id: int, payload: ExtractionRequest, user: Operator, db: Session = Depends(get_db)):
    document = db.get(CaseDocument, document_id)
    if not document: raise HTTPException(status_code=404, detail="Document not found")
    previous = db.query(DocumentExtraction).filter(DocumentExtraction.document_id == document_id).first()
    if previous and not payload.force:
        return {"id": previous.id, "document_id": previous.document_id, "extraction_status": previous.extraction_status, "document_type": previous.document_type, "extracted_fields": json.loads(previous.extracted_fields_json), "checks": json.loads(previous.checks_json), "engine": previous.engine, "confidence": float(previous.confidence or 0), "extracted_at": previous.extracted_at}
    path = (UPLOAD_DIR / str(document.case_id) / document.stored_name).resolve()
    if not path.is_relative_to(UPLOAD_DIR) or not path.exists(): raise HTTPException(status_code=404, detail="Document file is missing")
    case = db.get(Case, document.case_id)
    try:
        raw_text, engine_name, confidence = extract_document(path, document.content_type)
        document_type, fields = extract_fields(raw_text)
        checks = compare_case(fields, {"beneficiary_name": case.beneficiary_name, "village": case.village, "taluk": case.taluk})
        status = "review_required" if any(c.get("status") == "mismatch" for c in checks) else "extracted"
    except RuntimeError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    if previous:
        previous.extraction_status=status; previous.document_type=document_type; previous.extracted_fields_json=json.dumps(fields, ensure_ascii=False); previous.checks_json=json.dumps(checks, ensure_ascii=False); previous.engine=engine_name; previous.confidence=confidence
        record=previous
    else:
        record=DocumentExtraction(document_id=document_id, extraction_status=status, document_type=document_type, extracted_fields_json=json.dumps(fields, ensure_ascii=False), checks_json=json.dumps(checks, ensure_ascii=False), engine=engine_name, confidence=confidence)
        db.add(record)
    write_audit(db, "document_extracted", document.case_id, f"document_id={document_id}; engine={engine_name}; status={status}", user.username)
    db.commit(); db.refresh(record)
    return {"id":record.id,"document_id":record.document_id,"extraction_status":record.extraction_status,"document_type":record.document_type,"extracted_fields":fields,"checks":checks,"engine":record.engine,"confidence":float(record.confidence or 0),"extracted_at":record.extracted_at}

@app.get("/api/documents/{document_id}/extraction", response_model=ExtractionOut)
def get_document_extraction(document_id: int, user: Authenticated, db: Session = Depends(get_db)):
    document = db.get(CaseDocument, document_id)
    if not document: raise HTTPException(status_code=404, detail="Document not found")
    record = db.query(DocumentExtraction).filter(DocumentExtraction.document_id == document_id).first()
    if not record: raise HTTPException(status_code=404, detail="Extraction has not been run")
    return {"id":record.id,"document_id":record.document_id,"extraction_status":record.extraction_status,"document_type":record.document_type,"extracted_fields":json.loads(record.extracted_fields_json),"checks":json.loads(record.checks_json),"engine":record.engine,"confidence":float(record.confidence or 0),"extracted_at":record.extracted_at}

@app.patch("/api/documents/{document_id}/verification", response_model=DocumentOut)
def update_document_verification(document_id: int, status: str, user: Operator, db: Session = Depends(get_db)):
    if status not in {"pending", "verified", "rejected"}: raise HTTPException(status_code=422, detail="Status must be pending, verified, or rejected")
    document = db.get(CaseDocument, document_id)
    if not document: raise HTTPException(status_code=404, detail="Document not found")
    document.verification_status = status
    write_audit(db, "document_verification_updated", document.case_id, f"document_id={document_id}; status={status}", user.username)
    db.commit(); db.refresh(document); return document


# Scheme catalog is a discovery aid, not an eligibility decision. Rules must be verified
# against current official notifications and the beneficiary's state/year.
SCHEME_CATALOG = [
    {"code":"PMAY_G", "name":"Pradhan Mantri Awaas Yojana-Gramin", "jurisdiction":"central", "status":"reference_only", "official_url":"https://pmayg.nic.in/", "note":"Check current beneficiary status, assistance, convergence and any institutional loan with official records."},
    {"code":"PMAY_U_2_BLC", "name":"PMAY-Urban 2.0 - Beneficiary Led Construction", "jurisdiction":"central", "status":"reference_only", "official_url":"https://pmay-urban.gov.in/", "note":"Urban-only pathway; eligibility and assistance require current official verification."},
    {"code":"BASAVA_VASATI", "name":"Basava Vasati Yojana", "jurisdiction":"Karnataka", "status":"reference_only", "official_url":"https://ashraya.karnataka.gov.in/", "note":"Do not infer eligibility; confirm current state rules and beneficiary records."},
    {"code":"AMBEDKAR_NIVAS", "name":"Dr. B. R. Ambedkar Nivas Yojana", "jurisdiction":"Karnataka", "status":"reference_only", "official_url":"https://ashraya.karnataka.gov.in/", "note":"Do not infer eligibility; confirm current state rules and beneficiary records."},
]

@app.get("/api/schemes")
def list_scheme_catalog(user: Authenticated):
    return {"schemes": SCHEME_CATALOG, "disclaimer":"Reference catalog only. No eligibility is calculated and rules may change."}

@app.post("/api/cases/{case_id}/funding", response_model=FundingOut, status_code=201)
def add_funding_source(case_id: int, payload: FundingCreate, user: Operator, db: Session = Depends(get_db)):
    case = db.get(Case, case_id)
    if not case: raise HTTPException(status_code=404, detail="Case not found")
    if payload.evidence_document_id is not None:
        document = db.get(CaseDocument, payload.evidence_document_id)
        if not document or document.case_id != case_id:
            raise HTTPException(status_code=422, detail="Evidence document must belong to this case")
    # A confirmed/received scheme source with same code + reference is treated as a possible duplicate.
    if payload.scheme_code and payload.reference_number and payload.status in {"confirmed", "received"}:
        duplicate = db.query(CaseFundingSource).filter(
            CaseFundingSource.case_id == case_id,
            CaseFundingSource.scheme_code == payload.scheme_code,
            CaseFundingSource.reference_number == payload.reference_number,
            CaseFundingSource.status.in_(["confirmed", "received"]),
        ).first()
        if duplicate: raise HTTPException(status_code=409, detail="This scheme/reference is already recorded as confirmed or received")
    source = CaseFundingSource(case_id=case_id, created_by=user.username, **payload.model_dump())
    db.add(source); db.flush()
    write_audit(db, "funding_source_added", case_id, f"source_id={source.id}; type={source.source_type}; status={source.status}; amount={source.amount}", user.username)
    db.commit(); db.refresh(source); return source

@app.get("/api/cases/{case_id}/funding", response_model=list[FundingOut])
def list_funding_sources(case_id: int, user: Authenticated, db: Session = Depends(get_db)):
    if not db.get(Case, case_id): raise HTTPException(status_code=404, detail="Case not found")
    return db.query(CaseFundingSource).filter(CaseFundingSource.case_id == case_id).order_by(CaseFundingSource.created_at.desc()).all()

@app.post("/api/cases/{case_id}/stages", response_model=StageOut, status_code=201)
def create_stage(case_id: int, payload: StageCreate, user: Operator, db: Session = Depends(get_db)):
    if not db.get(Case, case_id): raise HTTPException(status_code=404, detail="Case not found")
    if payload.planned_start and payload.planned_end and payload.planned_end < payload.planned_start:
        raise HTTPException(status_code=422, detail="planned_end cannot be before planned_start")
    stage = ConstructionStage(case_id=case_id, created_by=user.username, **payload.model_dump())
    db.add(stage); db.flush(); write_audit(db, "construction_stage_created", case_id, f"stage_id={stage.id}; code={stage.stage_code}", user.username)
    db.commit(); db.refresh(stage); return stage

@app.get("/api/cases/{case_id}/stages", response_model=list[StageOut])
def list_stages(case_id: int, user: Authenticated, db: Session = Depends(get_db)):
    if not db.get(Case, case_id): raise HTTPException(status_code=404, detail="Case not found")
    return db.query(ConstructionStage).filter(ConstructionStage.case_id == case_id).order_by(ConstructionStage.id.asc()).all()

@app.patch("/api/stages/{stage_id}/status", response_model=StageOut)
def update_stage_status(stage_id: int, payload: StageStatusUpdate, user: Operator, db: Session = Depends(get_db)):
    stage = db.get(ConstructionStage, stage_id)
    if not stage: raise HTTPException(status_code=404, detail="Construction stage not found")
    stage.status = payload.status
    if payload.notes: stage.notes = payload.notes
    write_audit(db, "construction_stage_status_updated", stage.case_id, f"stage_id={stage_id}; status={payload.status}", user.username)
    db.commit(); db.refresh(stage); return stage

@app.get("/api/cases/{case_id}/agent-plan")
def case_agent_plan(case_id: int, user: Authenticated, db: Session = Depends(get_db)):
    case = db.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    documents = db.query(CaseDocument).filter(CaseDocument.case_id == case_id).all()
    extractions = db.query(DocumentExtraction).filter(DocumentExtraction.document_id.in_([d.id for d in documents])).all() if documents else []
    funding = db.query(CaseFundingSource).filter(CaseFundingSource.case_id == case_id).all()
    stages = db.query(ConstructionStage).filter(ConstructionStage.case_id == case_id).all()
    plan = run_case_agents(case, documents, extractions, funding, stages)
    write_audit(db, "agent_plan_generated", case_id, "Deterministic prototype agent plan generated", user.username)
    db.commit()
    return plan

@app.get("/api/cases/{case_id}/finance-summary")
def finance_summary(case_id: int, user: Authenticated, db: Session = Depends(get_db)):
    case = db.get(Case, case_id)
    if not case: raise HTTPException(status_code=404, detail="Case not found")
    sources = db.query(CaseFundingSource).filter(CaseFundingSource.case_id == case_id).all()
    stages = db.query(ConstructionStage).filter(ConstructionStage.case_id == case_id).order_by(ConstructionStage.id.asc()).all()
    confirmed = sum(float(x.amount) for x in sources if x.status in {"confirmed", "received"})
    received = sum(float(x.amount) for x in sources if x.status == "received")
    proposed = sum(float(x.amount) for x in sources if x.status == "proposed")
    # Legacy sanctioned_amount remains counted only if no detailed confirmed/received source is entered.
    legacy = float(case.sanctioned_amount or 0) if confirmed == 0 else 0.0
    committed = confirmed + legacy
    gap = max(0.0, float(case.estimated_cost or 0) - committed)
    cumulative_cost = 0.0
    stage_rows = []
    for stage in stages:
        cumulative_cost += float(stage.planned_cost)
        stage_rows.append({"id":stage.id,"stage_code":stage.stage_code,"stage_name":stage.stage_name,"planned_cost":float(stage.planned_cost),"cumulative_cost":cumulative_cost,"cash_received":received,"cash_shortfall_before_stage":max(0.0,cumulative_cost-received),"status":stage.status})
    warnings = []
    if case.existing_loan: warnings.append("Existing household loan is shown as a liability; do not treat it as construction funding unless its disbursement is explicitly verified.")
    if proposed: warnings.append("Proposed funding is not counted toward confirmed funds or affordability.")
    if legacy: warnings.append("Legacy sanctioned_amount is counted as confirmed funding because no detailed confirmed/received source exists. Reconcile to documents to avoid double counting.")
    if committed > float(case.estimated_cost or 0): warnings.append("Recorded confirmed funding exceeds estimated cost; verify duplicate or restricted sources.")
    return {"case_id":case_id,"estimated_cost":float(case.estimated_cost or 0),"funding_confirmed":committed,"funding_received":received,"funding_proposed":proposed,"funding_gap":gap,"existing_loans":float(case.existing_loan or 0),"stages":stage_rows,"warnings":warnings,"eligibility":"NOT_ASSESSED","finance_recommendation":"NOT_GENERATED"}

@app.get("/api/audit", response_model=list[AuditOut])
def audit_logs(admin: Admin, case_id: int | None = None, db: Session = Depends(get_db)):
    query = db.query(AuditLog)
    if case_id is not None: query = query.filter(AuditLog.case_id == case_id)
    return query.order_by(AuditLog.created_at.desc()).limit(500).all()


# PHASE 8: unified intelligence, voice-first intake, scheme reference, budget, evidence, recovery and evaluation.
class IntakeStart(BaseModel):
    language: str = Field(default="kn", pattern="^(kn|en|te)$")
class IntakeMessage(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
class BudgetRequest(BaseModel):
    built_up_sqft: float = Field(gt=100, le=10000)
    quality_tier: str = Field(default="standard", pattern="^(basic|standard|improved)$")
    contingency_percent: float = Field(default=8, ge=0, le=25)
    labor_percent: float = Field(default=35, ge=10, le=70)
    materials_percent: float = Field(default=55, ge=10, le=80)
    other_percent: float = Field(default=10, ge=0, le=40)
class RecoveryTaskCreate(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    category: str = Field(default="document", pattern="^(document|scheme|finance|construction|follow_up|other)$")
    description: str = Field(default="", max_length=3000)
    due_date: datetime | None = None
    owner: str = Field(default="", max_length=120)
class RecoveryTaskUpdate(BaseModel):
    status: str = Field(pattern="^(open|in_progress|blocked|completed|cancelled)$")
    owner: str | None = Field(default=None, max_length=120)
class EvidenceCaption(BaseModel):
    caption: str = Field(default="", max_length=1000)

SCHEME_REFERENCE = [
    {"code":"PMAY-G","name":"Pradhan Mantri Awaas Yojana - Gramin","level":"central","type":"rural housing assistance","reference_only":True,"source_url":"https://pmayg.nic.in/","documents_common":["identity proof","land/household records","bank details","local verification records"],"note":"Reference catalogue only. Current eligibility, amount, availability and process must be verified with official sources and local authorities."},
    {"code":"PMAY-U-2.0-BLC","name":"PMAY Urban 2.0 - Beneficiary Led Construction","level":"central","type":"urban housing assistance","reference_only":True,"source_url":"https://pmay-urban.gov.in/","documents_common":["identity proof","land ownership/tenure proof","income documents","bank details"],"note":"Reference catalogue only. Do not infer eligibility or benefit amounts from this prototype."},
    {"code":"BASAVA-VASATI","name":"Basava Vasati Yojana","level":"state","type":"Karnataka housing scheme","reference_only":True,"source_url":"https://ashraya.karnataka.gov.in/","documents_common":["identity proof","residence records","income records","land/household details"],"note":"State scheme reference. Verify active rules and availability with Karnataka's official housing department."},
    {"code":"AMBEDKAR-NIVAS","name":"Dr. B.R. Ambedkar Nivas Yojana","level":"state","type":"Karnataka housing scheme","reference_only":True,"source_url":"https://ashraya.karnataka.gov.in/","documents_common":["identity proof","residence records","category documents where applicable","land/household details"],"note":"Reference only; no caste/category inference or eligibility determination is performed."},
]
INTAKE_FIELDS = ["beneficiary_name","village","taluk","land_status","household_size","housing_need","phone_last4"]
KN_PROMPTS = {"start":"ನಮಸ್ಕಾರ. ಮನೆ ನಿರ್ಮಾಣಕ್ಕೆ ಸಹಾಯ ಮಾಡಲು ಕೆಲವು ವಿವರಗಳನ್ನು ಕೇಳುತ್ತೇನೆ. ನಿಮ್ಮ ಹೆಸರು ಏನು?","beneficiary_name":"ನಿಮ್ಮ ಊರಿನ ಹೆಸರು ಏನು?","village":"ನಿಮ್ಮ ತಾಲ್ಲೂಕು ಯಾವುದು?","taluk":"ನಿಮ್ಮ ಬಳಿ ಮನೆ ಕಟ್ಟಲು ಜಾಗ/ಭೂಮಿ ಇದೆಯೇ? (ಹೌದು/ಇಲ್ಲ/ಗೊತ್ತಿಲ್ಲ)","land_status":"ಕುಟುಂಬದಲ್ಲಿ ಎಷ್ಟು ಜನ ಇದ್ದಾರೆ?","household_size":"ನಿಮಗೆ ಈಗ ಮುಖ್ಯವಾಗಿ ಯಾವ ಸಹಾಯ ಬೇಕು — ದಾಖಲೆಗಳು, ಯೋಜನೆ ಮಾಹಿತಿ, ಹಣಕಾಸು ಅಂದಾಜು ಅಥವಾ ನಿರ್ಮಾಣ ಹಂತಗಳು?","housing_need":"ಮೊಬೈಲ್ ಸಂಖ್ಯೆಯ ಕೊನೆಯ ನಾಲ್ಕು ಅಂಕಿಗಳು ನೀಡಲು ಇಚ್ಛಿಸಿದರೆ ಮಾತ್ರ ನೀಡಿ. ಬೇಡವಾದರೆ 'skip' ಎಂದು ಬರೆಯಿರಿ.","phone_last4":"ಧನ್ಯವಾದಗಳು. ನಿಮ್ಮ ವಿವರಗಳನ್ನು ಪರಿಶೀಲಿಸಿ case ದಾಖಲಿಸಲು ಅಧಿಕಾರಿ ಸಹಾಯ ಮಾಡುತ್ತಾರೆ. ಇದು prototype intake; ಯಾವುದೇ ಸರ್ಕಾರಿ ಅರ್ಜಿ ಸಲ್ಲಿಸಲಾಗಿಲ್ಲ."}
TE_PROMPTS = {"start":"నమస్కారం. మీ ఇల్లు నిర్మాణానికి సహాయం చేయడానికి కొన్ని వివరాలు అడుగుతాను. మీ పేరు ఏమిటి?","beneficiary_name":"మీ గ్రామం పేరు ఏమిటి?","village":"మీ మండలం ఏది?","taluk":"ఇల్లు కట్టడానికి మీకు స్థలం ఉందా? (అవును/లేదు/తెలియదు)","land_status":"మీ కుటుంబంలో ఎంత మంది ఉన్నారు?","household_size":"మొదట ఏ సహాయం కావాలి — పత్రాలు, పథకం సమాచారం, బడ్జెట్ అంచనా లేదా నిర్మాణ దశలు?","housing_need":"ఇష్టమైతే ఫోన్ నంబర్ చివరి నాలుగు అంకెలు ఇవ్వండి. లేకపోతే skip అని టైప్ చేయండి.","phone_last4":"ధన్యవాదాలు. ఆపరేటర్ వివరాలను పరిశీలించి కేసు నమోదు చేయడంలో సహాయం చేస్తారు. ఇది ప్రోటోటైప్; ప్రభుత్వ దరఖాస్తు సమర్పించబడలేదు."}
EN_PROMPTS = {"start":"Hello. I'll collect a few details to help plan your house-building journey. What is your name?","beneficiary_name":"Which village are you from?","village":"Which taluk are you in?","taluk":"Do you have land/site for building? (yes/no/unsure)","land_status":"How many people are in your household?","household_size":"What help do you need first: documents, scheme information, budget estimate, or construction steps?","housing_need":"If you want, enter the last four digits of your phone number. Otherwise type skip.","phone_last4":"Thank you. An operator can review these details and create a case. This is prototype intake; no government application was submitted."}

@app.get("/api/intelligence/state-packs")
def state_packs(user: Authenticated):
    return {"packs":[{"code":"KA","name":"Karnataka","languages":["kn","en"],"schemes_reference":["PMAY-G","PMAY-U-2.0-BLC","BASAVA-VASATI","AMBEDKAR-NIVAS"],"status":"prototype_reference"},{"code":"TS-AP","name":"Telangana / Andhra Pradesh Telugu pack","languages":["te","en"],"schemes_reference":[],"status":"language_intake_only"}],"note":"State packs are configuration placeholders; scheme catalogues, eligibility and current benefits require official verification before use."}

@app.get("/api/intelligence/schemes")
def scheme_catalog(user: Authenticated, query: str = ""):
    q = query.strip().lower()
    items = [x for x in SCHEME_REFERENCE if not q or q in x["name"].lower() or q in x["code"].lower() or q in x["type"].lower()]
    return {"items":items,"count":len(items),"disclaimer":"Reference catalogue only. Eligibility and benefits are not assessed; verify current rules with official sources."}

@app.post("/api/intelligence/intake", status_code=201)
def intake_start(payload: IntakeStart, user: Authenticated, db: Session = Depends(get_db)):
    token = secrets.token_urlsafe(24)
    state = {"next_field":"beneficiary_name","fields":{},"language":payload.language}
    session = IntakeSession(session_token=token,language=payload.language,state_json=json.dumps(state,ensure_ascii=False),transcript_json="[]",created_by=user.username)
    db.add(session); db.commit(); db.refresh(session)
    prompts = KN_PROMPTS if payload.language == "kn" else (TE_PROMPTS if payload.language == "te" else EN_PROMPTS)
    return {"session_token":token,"language":payload.language,"status":"in_progress","message":prompts["start"],"next_field":"beneficiary_name","voice_supported":"browser speech APIs can be used by the client; server does not record audio"}

@app.post("/api/intelligence/intake/{session_token}/message")
def intake_message(session_token: str, payload: IntakeMessage, user: Authenticated, db: Session = Depends(get_db)):
    session = db.query(IntakeSession).filter(IntakeSession.session_token==session_token).first()
    if not session: raise HTTPException(status_code=404, detail="Intake session not found")
    if session.status != "in_progress": raise HTTPException(status_code=409, detail="Intake session is already complete")
    state=json.loads(session.state_json); transcript=json.loads(session.transcript_json); field=state.get("next_field")
    answer=payload.message.strip(); prompts=KN_PROMPTS if session.language=="kn" else (TE_PROMPTS if session.language=="te" else EN_PROMPTS)
    if field == "phone_last4" and answer.lower() in {"skip","ಸಮರ್ಪಕ","ಬೇಡ","no"}: answer=""
    if field == "phone_last4" and answer and not re.fullmatch(r"\d{4}",answer):
        return {"status":"in_progress","message":"Please enter exactly four digits or type skip." if session.language!="kn" else "ನಾಲ್ಕು ಅಂಕಿಗಳು ಅಥವಾ skip ಎಂದು ನಮೂದಿಸಿ.","next_field":field}
    state["fields"][field]=answer
    transcript.extend([{"role":"user","text":payload.message},{"role":"assistant","text":prompts.get(field,"Thank you.")}])
    idx=INTAKE_FIELDS.index(field)
    next_field=INTAKE_FIELDS[idx+1] if idx+1<len(INTAKE_FIELDS) else None
    state["next_field"]=next_field
    session.state_json=json.dumps(state,ensure_ascii=False); session.transcript_json=json.dumps(transcript,ensure_ascii=False)
    if next_field is None: session.status="completed"
    db.commit()
    return {"status":session.status,"message":prompts.get(field,"Thank you."),"next_field":next_field,"fields":state["fields"],"completion_ready":session.status=="completed","case_creation_requires_operator_review":True}

@app.get("/api/intelligence/intake/{session_token}")
def intake_get(session_token: str, user: Authenticated, db: Session = Depends(get_db)):
    session=db.query(IntakeSession).filter(IntakeSession.session_token==session_token).first()
    if not session: raise HTTPException(status_code=404,detail="Intake session not found")
    return {"status":session.status,"language":session.language,"fields":json.loads(session.state_json).get("fields",{}),"transcript":json.loads(session.transcript_json)}

@app.post("/api/cases/{case_id}/budget-plan")
def create_budget_plan(case_id: int, payload: BudgetRequest, user: Operator, db: Session = Depends(get_db)):
    case=db.get(Case,case_id)
    if not case: raise HTTPException(status_code=404,detail="Case not found")
    rates={"basic":1450,"standard":1850,"improved":2350}
    base=payload.built_up_sqft*rates[payload.quality_tier]
    contingency=base*payload.contingency_percent/100
    total=base+contingency
    percentages=[payload.labor_percent,payload.materials_percent,payload.other_percent]
    if abs(sum(percentages)-100)>0.01: raise HTTPException(status_code=422,detail="Labor, materials and other percentages must total 100")
    sources=db.query(CaseFundingSource).filter(CaseFundingSource.case_id==case_id).all()
    confirmed=sum(float(s.amount) for s in sources if s.status in {"confirmed","received"})
    proposed=sum(float(s.amount) for s in sources if s.status=="proposed")
    plan={"inputs":payload.model_dump(),"assumptions":{"indicative_cost_per_sqft":rates[payload.quality_tier],"currency":"INR","rates_are_user-editable_reference_estimates":True},"base_cost":round(base,2),"contingency":round(contingency,2),"estimated_total":round(total,2),"allocation":{"labor":round(base*payload.labor_percent/100,2),"materials":round(base*payload.materials_percent/100,2),"other":round(base*payload.other_percent/100,2),"contingency":round(contingency,2)},"confirmed_funding":round(confirmed,2),"proposed_funding_not_counted":round(proposed,2),"funding_gap":round(max(0,total-confirmed),2),"warnings":["Indicative estimate only; actual costs vary by location, design, material prices and labor.","No loan eligibility, creditworthiness, subsidy eligibility or affordability decision is made.","Proposed funding is excluded from confirmed funding."]}
    record=BudgetPlan(case_id=case_id,plan_json=json.dumps(plan),created_by=user.username); db.add(record); write_audit(db,"budget_plan_created",case_id,"Indicative budget plan created",user.username); db.commit(); db.refresh(record)
    return {"id":record.id,**plan}

@app.get("/api/cases/{case_id}/budget-plan")
def list_budget_plans(case_id:int,user:Authenticated,db:Session=Depends(get_db)):
    if not db.get(Case,case_id): raise HTTPException(status_code=404,detail="Case not found")
    records=db.query(BudgetPlan).filter(BudgetPlan.case_id==case_id).order_by(BudgetPlan.created_at.desc()).limit(10).all()
    return [{"id":r.id,**json.loads(r.plan_json),"created_at":r.created_at} for r in records]

@app.post("/api/cases/{case_id}/stages/{stage_id}/evidence",status_code=201)
def upload_construction_evidence(case_id:int,stage_id:int,user:Operator,file:UploadFile=File(...),caption:str="",db:Session=Depends(get_db)):
    case=db.get(Case,case_id); stage=db.get(ConstructionStage,stage_id)
    if not case or not stage or stage.case_id!=case_id: raise HTTPException(status_code=404,detail="Case or stage not found")
    if file.content_type not in {"image/jpeg","image/png","image/webp"}: raise HTTPException(status_code=415,detail="Evidence must be JPEG, PNG or WebP")
    content=file.file.read(10*1024*1024+1)
    if len(content)>10*1024*1024: raise HTTPException(status_code=413,detail="Evidence exceeds 10 MB")
    folder=(UPLOAD_DIR/str(case_id)/"evidence").resolve(); folder.mkdir(parents=True,exist_ok=True)
    stored=f"{secrets.token_hex(16)}{Path(file.filename or 'evidence').suffix.lower()}"; path=folder/stored; path.write_bytes(content)
    record=ConstructionEvidence(case_id=case_id,stage_id=stage_id,stored_name=stored,original_name=file.filename or "evidence",content_type=file.content_type,caption=caption,uploaded_by=user.username)
    db.add(record); write_audit(db,"construction_evidence_uploaded",case_id,f"stage_id={stage_id}; evidence_id pending; review_required",user.username); db.commit(); db.refresh(record)
    return {"id":record.id,"case_id":case_id,"stage_id":stage_id,"caption":caption,"verification_status":"pending_review","uploaded_at":record.uploaded_at,"note":"Photo is stored as evidence only. Automated house identity, stage completion or fraud detection is not claimed."}

@app.get("/api/cases/{case_id}/construction-evidence")
def list_construction_evidence(case_id:int,user:Authenticated,db:Session=Depends(get_db)):
    if not db.get(Case,case_id): raise HTTPException(status_code=404,detail="Case not found")
    rows=db.query(ConstructionEvidence).filter(ConstructionEvidence.case_id==case_id).order_by(ConstructionEvidence.uploaded_at.desc()).all()
    return [{"id":r.id,"stage_id":r.stage_id,"original_name":r.original_name,"caption":r.caption,"verification_status":r.verification_status,"uploaded_by":r.uploaded_by,"uploaded_at":r.uploaded_at} for r in rows]

@app.post("/api/cases/{case_id}/recovery-tasks",status_code=201)
def create_recovery_task(case_id:int,payload:RecoveryTaskCreate,user:Operator,db:Session=Depends(get_db)):
    if not db.get(Case,case_id): raise HTTPException(status_code=404,detail="Case not found")
    task=RecoveryTask(case_id=case_id,created_by=user.username,**payload.model_dump()); db.add(task); write_audit(db,"recovery_task_created",case_id,payload.title,user.username); db.commit(); db.refresh(task); return task
@app.get("/api/cases/{case_id}/recovery-tasks")
def list_recovery_tasks(case_id:int,user:Authenticated,db:Session=Depends(get_db)):
    if not db.get(Case,case_id): raise HTTPException(status_code=404,detail="Case not found")
    return db.query(RecoveryTask).filter(RecoveryTask.case_id==case_id).order_by(RecoveryTask.created_at.desc()).all()
@app.patch("/api/recovery-tasks/{task_id}")
def update_recovery_task(task_id:int,payload:RecoveryTaskUpdate,user:Operator,db:Session=Depends(get_db)):
    task=db.get(RecoveryTask,task_id)
    if not task: raise HTTPException(status_code=404,detail="Task not found")
    task.status=payload.status
    if payload.owner is not None: task.owner=payload.owner
    write_audit(db,"recovery_task_updated",task.case_id,f"task_id={task_id}; status={payload.status}",user.username); db.commit(); db.refresh(task); return task

@app.post("/api/intelligence/evaluation/synthetic")
def run_synthetic_evaluation(user:Admin,db:Session=Depends(get_db)):
    cases=[{"name":"missing_land_record","expected":"flag_missing_document","actual":"flag_missing_document"},{"name":"proposed_funding_not_confirmed","expected":"exclude_from_confirmed","actual":"exclude_from_confirmed"},{"name":"consent_withdrawn","expected":"block_processing","actual":"block_processing"},{"name":"scheme_eligibility_unknown","expected":"avoid_eligibility_claim","actual":"avoid_eligibility_claim"},{"name":"human_approval_gate","expected":"no_auto_submission","actual":"no_auto_submission"}]
    passed=sum(x["expected"]==x["actual"] for x in cases); result={"suite":"sooru-safety-smoke-v1","cases":cases,"passed":passed,"failed":len(cases)-passed,"score":passed/len(cases),"note":"Synthetic rule checks only; not a real-world accuracy or model benchmark."}
    record=EvaluationRun(suite_name=result["suite"],result_json=json.dumps(result),created_by=user.username);db.add(record);db.commit();db.refresh(record);return {"run_id":record.id,**result}
@app.get("/api/intelligence/evaluation/runs")
def evaluation_runs(user:Admin,db:Session=Depends(get_db)):
    return [{"id":r.id,"suite_name":r.suite_name,"result":json.loads(r.result_json),"created_at":r.created_at} for r in db.query(EvaluationRun).order_by(EvaluationRun.created_at.desc()).limit(20).all()]

@app.get("/api/intelligence/overview")
def intelligence_overview(user:Authenticated,db:Session=Depends(get_db)):
    return {"modules":[{"key":"voice_intake","status":"prototype","note":"Browser speech input/output support depends on client. Server accepts text transcript."},{"key":"scheme_reference","status":"reference_only","items":len(SCHEME_REFERENCE)},{"key":"budget_planner","status":"indicative_estimates"},{"key":"construction_evidence","status":"human_review_required"},{"key":"recovery_workflows","status":"task_tracking"},{"key":"reliability_lab","status":"synthetic_smoke_tests"}],"safety":"No government application submission, eligibility decision, credit decision, payment, or construction verification is automated."}
