"""Construction stages and stage photo evidence."""

import secrets
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..core import config
from ..core.audit import write_audit
from ..core.security import Authenticated, Operator
from ..database import get_db
from ..models import Case, ConstructionEvidence, ConstructionStage
from ..schemas import StageCreate, StageOut, StageStatusUpdate

router = APIRouter()


@router.post("/api/cases/{case_id}/stages", response_model=StageOut, status_code=201)
def create_stage(case_id: int, payload: StageCreate, user: Operator, db: Session = Depends(get_db)):
    if not db.get(Case, case_id):
        raise HTTPException(status_code=404, detail="Case not found")
    if payload.planned_start and payload.planned_end and (payload.planned_end < payload.planned_start):
        raise HTTPException(status_code=422, detail="planned_end cannot be before planned_start")
    stage = ConstructionStage(case_id=case_id, created_by=user.username, **payload.model_dump())
    db.add(stage)
    db.flush()
    write_audit(
        db, "construction_stage_created", case_id, f"stage_id={stage.id}; code={stage.stage_code}", user.username
    )
    db.commit()
    db.refresh(stage)
    return stage


@router.get("/api/cases/{case_id}/stages", response_model=list[StageOut])
def list_stages(case_id: int, user: Authenticated, db: Session = Depends(get_db)):
    if not db.get(Case, case_id):
        raise HTTPException(status_code=404, detail="Case not found")
    return (
        db.query(ConstructionStage)
        .filter(ConstructionStage.case_id == case_id)
        .order_by(ConstructionStage.id.asc())
        .all()
    )


@router.patch("/api/stages/{stage_id}/status", response_model=StageOut)
def update_stage_status(stage_id: int, payload: StageStatusUpdate, user: Operator, db: Session = Depends(get_db)):
    stage = db.get(ConstructionStage, stage_id)
    if not stage:
        raise HTTPException(status_code=404, detail="Construction stage not found")
    stage.status = payload.status
    if payload.notes:
        stage.notes = payload.notes
    write_audit(
        db,
        "construction_stage_status_updated",
        stage.case_id,
        f"stage_id={stage_id}; status={payload.status}",
        user.username,
    )
    db.commit()
    db.refresh(stage)
    return stage


class EvidenceCaption(BaseModel):
    caption: str = Field(default="", max_length=1000)


@router.post("/api/cases/{case_id}/stages/{stage_id}/evidence", status_code=201)
def upload_construction_evidence(
    case_id: int,
    stage_id: int,
    user: Operator,
    file: UploadFile = File(...),
    caption: str = "",
    db: Session = Depends(get_db),
):
    case = db.get(Case, case_id)
    stage = db.get(ConstructionStage, stage_id)
    if not case or not stage or stage.case_id != case_id:
        raise HTTPException(status_code=404, detail="Case or stage not found")
    if file.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(status_code=415, detail="Evidence must be JPEG, PNG or WebP")
    content = file.file.read(10 * 1024 * 1024 + 1)
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Evidence exceeds 10 MB")
    signatures = {
        "image/jpeg": content.startswith(b"\xff\xd8\xff"),
        "image/png": content.startswith(b"\x89PNG\r\n\x1a\n"),
        "image/webp": len(content) >= 12 and content[:4] == b"RIFF" and (content[8:12] == b"WEBP"),
    }
    if not signatures.get(file.content_type, False):
        raise HTTPException(status_code=415, detail="Evidence content does not match its image type")
    folder = (config.UPLOAD_DIR / str(case_id) / "evidence").resolve()
    folder.mkdir(parents=True, exist_ok=True)
    stored = f"{secrets.token_hex(16)}{Path(file.filename or 'evidence').suffix.lower()}"
    path = folder / stored
    path.write_bytes(content)
    record = ConstructionEvidence(
        case_id=case_id,
        stage_id=stage_id,
        stored_name=stored,
        original_name=file.filename or "evidence",
        content_type=file.content_type,
        caption=caption,
        uploaded_by=user.username,
    )
    db.add(record)
    write_audit(
        db,
        "construction_evidence_uploaded",
        case_id,
        f"stage_id={stage_id}; evidence_id pending; review_required",
        user.username,
    )
    db.commit()
    db.refresh(record)
    return {
        "id": record.id,
        "case_id": case_id,
        "stage_id": stage_id,
        "caption": caption,
        "verification_status": "pending_review",
        "uploaded_at": record.uploaded_at,
        "note": "Photo is stored as evidence only. Automated house identity, stage completion or fraud detection is not claimed.",
    }


@router.get("/api/cases/{case_id}/construction-evidence")
def list_construction_evidence(case_id: int, user: Authenticated, db: Session = Depends(get_db)):
    if not db.get(Case, case_id):
        raise HTTPException(status_code=404, detail="Case not found")
    rows = (
        db.query(ConstructionEvidence)
        .filter(ConstructionEvidence.case_id == case_id)
        .order_by(ConstructionEvidence.uploaded_at.desc())
        .all()
    )
    return [
        {
            "id": r.id,
            "stage_id": r.stage_id,
            "original_name": r.original_name,
            "caption": r.caption,
            "verification_status": r.verification_status,
            "uploaded_by": r.uploaded_by,
            "uploaded_at": r.uploaded_at,
        }
        for r in rows
    ]
