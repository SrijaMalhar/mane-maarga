"""Audit trail writes and the case gap calculation shared by routers."""

from sqlalchemy.orm import Session

from ..models import AuditLog


def calculate_gap(case) -> float:
    """Estimate minus sanctioned assistance. Existing loans are liabilities and never count as funding."""
    return max(0.0, float(case.estimated_cost or 0) - float(case.sanctioned_amount or 0))


def write_audit(db: Session, action: str, case_id: int | None, detail: str = "", actor: str = "system") -> None:
    db.add(AuditLog(case_id=case_id, actor=actor, action=action, detail=detail))
