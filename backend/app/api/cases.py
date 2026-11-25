"""Beneficiary cases and their consent records."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..core import config
from ..core.audit import calculate_gap, write_audit
from ..core.security import Admin, Authenticated, Operator
from ..database import get_db
from ..models import Case, CaseDocument, ConsentRecord
from ..schemas import CaseCreate, CaseOut, CaseUpdate, ConsentCreate, ConsentOut

router = APIRouter()


@router.get("/api/cases", response_model=list[CaseOut])
def list_cases(user: Authenticated, db: Session = Depends(get_db)):
    return db.query(Case).order_by(Case.created_at.desc()).all()


@router.post("/api/cases", response_model=CaseOut, status_code=201)
def create_case(payload: CaseCreate, user: Operator, db: Session = Depends(get_db)):
    case = Case(**payload.model_dump())
    case.gap_amount = calculate_gap(case)
    db.add(case)
    db.flush()
    write_audit(db, "case_created", case.id, "Beneficiary case created", user.username)
    db.commit()
    db.refresh(case)
    return case


@router.get("/api/cases/{case_id}", response_model=CaseOut)
def get_case(case_id: int, user: Authenticated, db: Session = Depends(get_db)):
    case = db.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    return case


@router.patch("/api/cases/{case_id}", response_model=CaseOut)
def update_case(case_id: int, payload: CaseUpdate, user: Operator, db: Session = Depends(get_db)):
    case = db.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    updates = payload.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(case, key, value)
    case.gap_amount = calculate_gap(case)
    write_audit(db, "case_updated", case.id, ",".join(sorted(updates.keys())), user.username)
    db.commit()
    db.refresh(case)
    return case


@router.delete("/api/cases/{case_id}", status_code=204)
def delete_case(case_id: int, admin: Admin, db: Session = Depends(get_db)):
    case = db.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    for document in db.query(CaseDocument).filter(CaseDocument.case_id == case_id).all():
        file_path = config.UPLOAD_DIR / str(case_id) / document.stored_name
        if file_path.exists():
            file_path.unlink()
        db.delete(document)
    write_audit(db, "case_deleted", case.id, "Beneficiary case deleted", admin.username)
    db.delete(case)
    db.commit()


@router.post("/api/cases/{case_id}/consent", response_model=ConsentOut, status_code=201)
def record_consent(case_id: int, payload: ConsentCreate, user: Operator, db: Session = Depends(get_db)):
    case = db.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    record = ConsentRecord(case_id=case_id, recorded_by=user.username, **payload.model_dump())
    case.consent_status = "given" if payload.consent_given else "withdrawn"
    db.add(record)
    write_audit(
        db,
        "consent_recorded",
        case_id,
        f"consent_given={payload.consent_given}; scope={payload.consent_scope}",
        user.username,
    )
    db.commit()
    db.refresh(record)
    return record


@router.get("/api/cases/{case_id}/consent", response_model=list[ConsentOut])
def consent_history(case_id: int, user: Authenticated, db: Session = Depends(get_db)):
    if not db.get(Case, case_id):
        raise HTTPException(status_code=404, detail="Case not found")
    return (
        db.query(ConsentRecord)
        .filter(ConsentRecord.case_id == case_id)
        .order_by(ConsentRecord.recorded_at.desc())
        .all()
    )
