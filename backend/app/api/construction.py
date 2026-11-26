"""Construction stages and stage photo evidence."""

import secrets
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
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
    if payload.status == "verified" and stage.status != "verified":
        accepted = (
            db.query(ConstructionEvidence)
            .filter(ConstructionEvidence.stage_id == stage_id, ConstructionEvidence.verification_status == "accepted")
            .count()
        )
        if not accepted:
            raise HTTPException(
                status_code=409, detail="Accept a site photo for this stage before marking it verified."
            )
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
        verification_status="pending_review",
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
            "verification_status": "pending_review" if r.verification_status == "pending" else r.verification_status,
            "uploaded_by": r.uploaded_by,
            "uploaded_at": r.uploaded_at,
            "reviewed_by": r.reviewed_by,
            "review_note": r.review_note,
            "reviewed_at": r.reviewed_at,
        }
        for r in rows
    ]


def _evidence_or_404(db: Session, evidence_id: int) -> ConstructionEvidence:
    ev = db.get(ConstructionEvidence, evidence_id)
    if ev is None:
        raise HTTPException(status_code=404, detail="Photo not found")
    return ev


@router.get("/api/construction-evidence/{evidence_id}/file")
def evidence_file(evidence_id: int, user: Authenticated, db: Session = Depends(get_db)):
    ev = _evidence_or_404(db, evidence_id)
    path = (config.UPLOAD_DIR / str(ev.case_id) / "evidence" / ev.stored_name).resolve()
    if not path.is_relative_to(config.UPLOAD_DIR.resolve()) or not path.exists():
        raise HTTPException(status_code=404, detail="Photo file is missing")
    return FileResponse(path, media_type=ev.content_type, filename=ev.original_name)


class EvidenceReview(BaseModel):
    status: Literal["accepted", "retake"]
    note: str = Field(default="", max_length=500)


@router.patch("/api/construction-evidence/{evidence_id}/review")
def review_evidence(evidence_id: int, body: EvidenceReview, user: Operator, db: Session = Depends(get_db)):
    """A person looks at the photo and accepts it or asks for a retake. The system never judges the image."""
    ev = _evidence_or_404(db, evidence_id)
    if body.status == "retake" and not body.note.strip():
        raise HTTPException(status_code=422, detail="Say what the retake should show.")
    ev.verification_status = body.status
    ev.review_note = body.note.strip()
    ev.reviewed_by = user.username
    ev.reviewed_at = datetime.now(UTC)
    write_audit(
        db,
        "construction_evidence_reviewed",
        ev.case_id,
        f"evidence_id={ev.id}; stage_id={ev.stage_id}; status={body.status}",
        user.username,
    )
    db.commit()
    return {
        "id": ev.id,
        "stage_id": ev.stage_id,
        "verification_status": ev.verification_status,
        "reviewed_by": ev.reviewed_by,
        "review_note": ev.review_note,
    }
