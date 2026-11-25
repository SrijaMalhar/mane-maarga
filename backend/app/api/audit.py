"""The audit trail (administrators only)."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..core.security import Admin
from ..database import get_db
from ..models import AuditLog
from ..schemas import AuditOut

router = APIRouter()


@router.get("/api/audit", response_model=list[AuditOut])
def audit_logs(admin: Admin, case_id: int | None = None, db: Session = Depends(get_db)):
    query = db.query(AuditLog)
    if case_id is not None:
        query = query.filter(AuditLog.case_id == case_id)
    return query.order_by(AuditLog.created_at.desc()).limit(500).all()
