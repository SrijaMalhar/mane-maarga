"""Approvals: the console view for case workers, and the public page a family uses with a one-time code.

Rules (policies/gated_actions.yaml):
- family actions (money, submissions, sharing documents) need the family's OTP. Staff cannot approve them.
- admin actions (status changes) need an administrator.
- Approved actions run through the executor once; any further attempt is refused and logged.
"""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..approvals import executor
from ..approvals import service as svc
from ..approvals.service import ApprovalError
from ..channels import otp
from ..core.security import Admin, Authenticated, Operator
from ..database import get_db
from ..models import ApprovalRequest, Case, OutboxMessage

router = APIRouter(tags=["approvals"])


def _raise(exc: Exception):
    if isinstance(exc, ApprovalError):
        raise HTTPException(status_code=exc.status, detail={"error": exc.code, "message": str(exc)}) from exc
    if isinstance(exc, otp.OtpError):
        raise HTTPException(status_code=400, detail={"error": exc.code, "message": str(exc)}) from exc
    raise exc


def _get(db: Session, approval_id: int) -> ApprovalRequest:
    req = db.get(ApprovalRequest, approval_id)
    if req is None:
        raise HTTPException(status_code=404, detail="Approval request not found")
    svc.expire_if_due(db, req)
    return req


# --- console ----------------------------------------------------------------------------------


@router.get("/api/cases/{case_id}/approvals")
def list_approvals(case_id: int, user: Authenticated, db: Session = Depends(get_db)):
    rows = (
        db.query(ApprovalRequest).filter(ApprovalRequest.case_id == case_id).order_by(ApprovalRequest.id.desc()).all()
    )
    for r in rows:
        svc.expire_if_due(db, r)
    db.commit()
    return [svc.out(r) for r in rows]


class RequestIn(BaseModel):
    action: str = Field(max_length=60)
    payload: dict = Field(default_factory=dict)
    reason: str = Field(min_length=5, max_length=2000)
    citations: list[str] = Field(default_factory=list, max_length=20)


@router.post("/api/cases/{case_id}/approvals", status_code=201)
def request_approval(case_id: int, body: RequestIn, user: Operator, db: Session = Depends(get_db)):
    """A case worker proposes a gated action. Returns the family link once; it cannot be read back later."""
    try:
        req, link = svc.create(db, case_id, body.action, body.payload, body.reason, body.citations, user.username)
    except ApprovalError as exc:
        _raise(exc)
    db.commit()
    return {**svc.out(req), "family_link": link}


@router.post("/api/approvals/{approval_id}/link")
def new_family_link(approval_id: int, user: Operator, db: Session = Depends(get_db)):
    """Make a new family link (the old one stops working). Only for pending family approvals."""
    req = _get(db, approval_id)
    if req.approver != "family":
        raise HTTPException(status_code=400, detail="This action is approved by an administrator, not the family")
    try:
        svc.require_pending(req)
    except ApprovalError as exc:
        _raise(exc)
    link = svc.new_link(req)
    db.commit()
    return {"family_link": link}


class Decision(BaseModel):
    approve: bool
    note: str = Field(default="", max_length=2000)


@router.post("/api/approvals/{approval_id}/decide")
def admin_decide(approval_id: int, body: Decision, user: Admin, db: Session = Depends(get_db)):
    req = _get(db, approval_id)
    if req.approver != "admin" and body.approve:
        db.commit()
        raise HTTPException(
            status_code=403,
            detail={
                "error": "family_approval_required",
                "message": "Only the family can approve this, with their one-time code.",
            },
        )
    try:
        svc.decide(
            db,
            req,
            body.approve,
            method="admin",
            approver_ref=f"admin:{user.username}",
            actor=user.username,
            note=body.note,
        )
        db.commit()
        if req.status == "approved":
            executor.execute(db, req.id, user.username)
    except ApprovalError as exc:
        _raise(exc)
    db.refresh(req)
    return svc.out(req)


@router.post("/api/approvals/{approval_id}/execute")
def execute(approval_id: int, user: Operator, db: Session = Depends(get_db)):
    """Run an approved action. Safe to retry: a second call is refused and logged."""
    try:
        result = executor.execute(db, approval_id, user.username)
    except ApprovalError as exc:
        _raise(exc)
    return {"executed": True, "result": result}


@router.get("/api/outbox")
def list_outbox(user: Operator, case_id: int | None = None, db: Session = Depends(get_db)):
    """Simulated messages and external actions. Shown in the console so a demo can follow them."""
    q = db.query(OutboxMessage)
    if case_id:
        q = q.filter(OutboxMessage.case_id == case_id)
    rows = q.order_by(OutboxMessage.id.desc()).limit(50).all()
    return [
        {
            "id": m.id,
            "channel": m.channel,
            "to": m.to_ref,
            "subject": m.subject,
            "body": m.body,
            "case_id": m.case_id,
            "approval_id": m.approval_id,
            "simulated": m.simulated,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in rows
    ]


# --- the family's page (no login: the link and a one-time code are the proof) ----------------------


@router.get("/api/public/approvals/{token}")
def family_view(token: str, db: Session = Depends(get_db)):
    try:
        req = svc.by_token(db, token)
    except ApprovalError as exc:
        _raise(exc)
    db.commit()
    case = db.get(Case, req.case_id)
    return {
        **svc.out(req, public=True),
        "beneficiary_first_name": case.beneficiary_name.split()[0],
        "phone_hint": otp.masked_phone(case),
    }


@router.post("/api/public/approvals/{token}/otp")
def family_send_code(token: str, db: Session = Depends(get_db)):
    try:
        req = svc.by_token(db, token)
        svc.require_pending(req)
        sent = otp.issue(db, req)
    except (ApprovalError, otp.OtpError) as exc:
        db.commit()
        _raise(exc)
    db.commit()
    return sent


class FamilyDecision(BaseModel):
    decision: Literal["approve", "reject"]
    code: str = Field(default="", max_length=6)


@router.post("/api/public/approvals/{token}/decision")
def family_decide(token: str, body: FamilyDecision, db: Session = Depends(get_db)):
    try:
        req = svc.by_token(db, token)
        svc.require_pending(req)
        if body.decision == "approve":
            otp.verify(db, req, body.code)
        case = db.get(Case, req.case_id)
        svc.decide(
            db,
            req,
            body.decision == "approve",
            method="otp" if body.decision == "approve" else "family_link",
            approver_ref=f"family:{otp.masked_phone(case)}",
            actor="family",
        )
        db.commit()
        if req.status == "approved":
            executor.execute(db, req.id, "family")
    except (ApprovalError, otp.OtpError) as exc:
        db.commit()
        _raise(exc)
    db.refresh(req)
    return svc.out(req, public=True)
