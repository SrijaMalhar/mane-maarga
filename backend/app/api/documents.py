"""Document upload, download, text extraction and reviewer verification."""

import json
import re
import secrets
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..core import config
from ..core.audit import write_audit
from ..core.config import MAX_UPLOAD_BYTES
from ..core.security import (
    Authenticated,
    Operator,
)
from ..database import get_db
from ..document_ai import compare_case, extract_document, extract_fields
from ..models import (
    Case,
    CaseDocument,
    DocumentExtraction,
)
from ..schemas import (
    DocumentOut,
    ExtractionOut,
    ExtractionRequest,
)

router = APIRouter()


@router.post("/api/cases/{case_id}/documents", response_model=DocumentOut, status_code=201)
def upload_document(case_id: int, user: Operator, file: UploadFile = File(...), db: Session = Depends(get_db)):
    case = db.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    original_name = Path(file.filename or "upload").name[:255]
    original_name = re.sub("[\\x00-\\x1f\\x7f]", "", original_name)
    ext = Path(original_name).suffix.lower()
    allowed = {".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg"}
    if ext not in allowed:
        raise HTTPException(status_code=415, detail="Only PDF, PNG, and JPEG files are accepted")
    if file.content_type and file.content_type not in {allowed[ext], "application/octet-stream"}:
        raise HTTPException(status_code=415, detail="Upload content type does not match file extension")
    data = file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds 10 MB limit")
    actual = (
        data.startswith(b"%PDF-")
        if ext == ".pdf"
        else data.startswith(b"\x89PNG\r\n\x1a\n")
        if ext == ".png"
        else data.startswith(b"\xff\xd8\xff")
    )
    if not actual:
        raise HTTPException(status_code=415, detail="File content does not match its extension")
    stored = f"{secrets.token_hex(24)}{ext}"
    case_dir = config.UPLOAD_DIR / str(case_id)
    case_dir.mkdir(parents=True, exist_ok=True)
    target = case_dir / stored
    target.write_bytes(data)
    document = CaseDocument(
        case_id=case_id,
        original_name=original_name,
        stored_name=stored,
        content_type=allowed[ext],
        size_bytes=len(data),
        verification_status="pending",
        uploaded_by=user.username,
    )
    db.add(document)
    db.flush()
    write_audit(db, "document_uploaded", case_id, f"document_id={document.id}; size={len(data)}", user.username)
    db.commit()
    db.refresh(document)
    return document


@router.get("/api/cases/{case_id}/documents", response_model=list[DocumentOut])
def list_documents(case_id: int, user: Authenticated, db: Session = Depends(get_db)):
    if not db.get(Case, case_id):
        raise HTTPException(status_code=404, detail="Case not found")
    return (
        db.query(CaseDocument).filter(CaseDocument.case_id == case_id).order_by(CaseDocument.uploaded_at.desc()).all()
    )


@router.get("/api/documents/{document_id}/download")
def download_document(document_id: int, user: Authenticated, db: Session = Depends(get_db)):
    document = db.get(CaseDocument, document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    path = (config.UPLOAD_DIR / str(document.case_id) / document.stored_name).resolve()
    if not path.is_relative_to(config.UPLOAD_DIR):
        raise HTTPException(status_code=400, detail="Invalid document path")
    if not path.exists():
        raise HTTPException(status_code=404, detail="Document file is missing")
    return FileResponse(path, media_type=document.content_type, filename=document.original_name)


@router.post("/api/documents/{document_id}/extract", response_model=ExtractionOut)
def extract_document_fields(
    document_id: int, payload: ExtractionRequest, user: Operator, db: Session = Depends(get_db)
):
    document = db.get(CaseDocument, document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    previous = db.query(DocumentExtraction).filter(DocumentExtraction.document_id == document_id).first()
    if previous and (not payload.force):
        return {
            "id": previous.id,
            "document_id": previous.document_id,
            "extraction_status": previous.extraction_status,
            "document_type": previous.document_type,
            "extracted_fields": json.loads(previous.extracted_fields_json),
            "checks": json.loads(previous.checks_json),
            "engine": previous.engine,
            "confidence": float(previous.confidence or 0),
            "extracted_at": previous.extracted_at,
        }
    path = (config.UPLOAD_DIR / str(document.case_id) / document.stored_name).resolve()
    if not path.is_relative_to(config.UPLOAD_DIR) or not path.exists():
        raise HTTPException(status_code=404, detail="Document file is missing")
    case = db.get(Case, document.case_id)
    try:
        raw_text, engine_name, confidence = extract_document(path, document.content_type)
        document_type, fields = extract_fields(raw_text)
        checks = compare_case(
            fields, {"beneficiary_name": case.beneficiary_name, "village": case.village, "taluk": case.taluk}
        )
        status = "review_required" if any(c.get("status") == "mismatch" for c in checks) else "extracted"
    except RuntimeError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    if previous:
        previous.extraction_status = status
        previous.document_type = document_type
        previous.extracted_fields_json = json.dumps(fields, ensure_ascii=False)
        previous.checks_json = json.dumps(checks, ensure_ascii=False)
        previous.engine = engine_name
        previous.confidence = confidence
        record = previous
    else:
        record = DocumentExtraction(
            document_id=document_id,
            extraction_status=status,
            document_type=document_type,
            extracted_fields_json=json.dumps(fields, ensure_ascii=False),
            checks_json=json.dumps(checks, ensure_ascii=False),
            engine=engine_name,
            confidence=confidence,
        )
        db.add(record)
    write_audit(
        db,
        "document_extracted",
        document.case_id,
        f"document_id={document_id}; engine={engine_name}; status={status}",
        user.username,
    )
    db.commit()
    db.refresh(record)
    return {
        "id": record.id,
        "document_id": record.document_id,
        "extraction_status": record.extraction_status,
        "document_type": record.document_type,
        "extracted_fields": fields,
        "checks": checks,
        "engine": record.engine,
        "confidence": float(record.confidence or 0),
        "extracted_at": record.extracted_at,
    }


@router.get("/api/documents/{document_id}/extraction", response_model=ExtractionOut)
def get_document_extraction(document_id: int, user: Authenticated, db: Session = Depends(get_db)):
    document = db.get(CaseDocument, document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    record = db.query(DocumentExtraction).filter(DocumentExtraction.document_id == document_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Extraction has not been run")
    return {
        "id": record.id,
        "document_id": record.document_id,
        "extraction_status": record.extraction_status,
        "document_type": record.document_type,
        "extracted_fields": json.loads(record.extracted_fields_json),
        "checks": json.loads(record.checks_json),
        "engine": record.engine,
        "confidence": float(record.confidence or 0),
        "extracted_at": record.extracted_at,
    }


@router.patch("/api/documents/{document_id}/verification", response_model=DocumentOut)
def update_document_verification(document_id: int, status: str, user: Operator, db: Session = Depends(get_db)):
    if status not in {"pending", "verified", "rejected"}:
        raise HTTPException(status_code=422, detail="Status must be pending, verified, or rejected")
    document = db.get(CaseDocument, document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    document.verification_status = status
    write_audit(
        db,
        "document_verification_updated",
        document.case_id,
        f"document_id={document_id}; status={status}",
        user.username,
    )
    db.commit()
    db.refresh(document)
    return document
