from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text
from .database import Base, engine, get_db
from .models import Case, ConsentRecord, AuditLog
from .schemas import CaseCreate, CaseUpdate, CaseOut, ConsentCreate, ConsentOut, AuditOut

Base.metadata.create_all(bind=engine)
# Lightweight local-development migration for existing Docker volumes.
# For production, replace this with versioned Alembic migrations.
with engine.begin() as conn:
    conn.execute(text("ALTER TABLE cases ADD COLUMN IF NOT EXISTS consent_status VARCHAR(20) DEFAULT 'pending'"))
app = FastAPI(title="Sooru API", version="0.3.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Prototype estimate: subtract only confirmed/sanctioned funding.
# Existing loans are liabilities/information and are not automatically treated as available funding.
def calculate_gap(case):
    return max(0, float(case.estimated_cost or 0) - float(case.sanctioned_amount or 0))

def write_audit(db: Session, action: str, case_id: int | None, detail: str = "", actor: str = "demo_operator"):
    db.add(AuditLog(case_id=case_id, actor=actor, action=action, detail=detail))

@app.get("/health")
def health():
    return {"status": "ok", "service": "sooru-api", "version": "0.3.0"}

@app.get("/api/cases", response_model=list[CaseOut])
def list_cases(db: Session = Depends(get_db)):
    return db.query(Case).order_by(Case.created_at.desc()).all()

@app.post("/api/cases", response_model=CaseOut, status_code=201)
def create_case(payload: CaseCreate, db: Session = Depends(get_db)):
    case = Case(**payload.model_dump())
    case.gap_amount = calculate_gap(case)
    db.add(case)
    db.flush()
    write_audit(db, "case_created", case.id, "Beneficiary case created")
    db.commit()
    db.refresh(case)
    return case

@app.get("/api/cases/{case_id}", response_model=CaseOut)
def get_case(case_id: int, db: Session = Depends(get_db)):
    case = db.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    return case

@app.patch("/api/cases/{case_id}", response_model=CaseOut)
def update_case(case_id: int, payload: CaseUpdate, db: Session = Depends(get_db)):
    case = db.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    updates = payload.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(case, key, value)
    case.gap_amount = calculate_gap(case)
    write_audit(db, "case_updated", case.id, ",".join(sorted(updates.keys())))
    db.commit()
    db.refresh(case)
    return case

@app.delete("/api/cases/{case_id}", status_code=204)
def delete_case(case_id: int, db: Session = Depends(get_db)):
    case = db.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    write_audit(db, "case_deleted", case.id, "Beneficiary case deleted")
    db.delete(case)
    db.commit()

@app.post("/api/cases/{case_id}/consent", response_model=ConsentOut, status_code=201)
def record_consent(case_id: int, payload: ConsentCreate, db: Session = Depends(get_db)):
    case = db.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    record = ConsentRecord(case_id=case_id, **payload.model_dump())
    case.consent_status = "given" if payload.consent_given else "withdrawn"
    db.add(record)
    write_audit(db, "consent_recorded", case_id, f"consent_given={payload.consent_given}; scope={payload.consent_scope}")
    db.commit()
    db.refresh(record)
    return record

@app.get("/api/cases/{case_id}/consent", response_model=list[ConsentOut])
def consent_history(case_id: int, db: Session = Depends(get_db)):
    if not db.get(Case, case_id):
        raise HTTPException(status_code=404, detail="Case not found")
    return db.query(ConsentRecord).filter(ConsentRecord.case_id == case_id).order_by(ConsentRecord.recorded_at.desc()).all()

@app.get("/api/audit", response_model=list[AuditOut])
def audit_logs(case_id: int | None = None, db: Session = Depends(get_db)):
    query = db.query(AuditLog)
    if case_id is not None:
        query = query.filter(AuditLog.case_id == case_id)
    return query.order_by(AuditLog.created_at.desc()).limit(500).all()
