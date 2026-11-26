"""Creating approval requests, the family link, and recording decisions. Nothing here executes an action."""

from __future__ import annotations

import hashlib
import json
import secrets
from datetime import timedelta

from pydantic import ValidationError
from sqlalchemy.orm import Session

from ..channels.otp import naive, now
from ..core.audit import write_audit
from ..models import ApprovalRequest, Case
from . import policy


class ApprovalError(Exception):
    def __init__(self, code: str, message: str, status: int = 422):
        super().__init__(message)
        self.code = code
        self.status = status


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def new_link(approval: ApprovalRequest) -> str:
    """A fresh link for the family. Only its hash is stored, so an old link stops working when a new one is made."""
    token = secrets.token_urlsafe(24)
    approval.token_hash = _token_hash(token)
    return f"/#/approve/{token}"


def create(
    db: Session, case_id: int, action: str, payload: dict, reason: str, citations: list[str], requested_by: str
) -> tuple[ApprovalRequest, str | None]:
    if not policy.is_gated(action):
        raise ApprovalError("not_gated", f"'{action}' is not a gated action")
    case = db.get(Case, case_id)
    if case is None:
        raise ApprovalError("case_not_found", f"Case {case_id} does not exist", 404)
    try:
        clean = policy.PAYLOADS[action].model_validate(payload).model_dump(mode="json", exclude_none=True)
    except ValidationError as exc:
        raise ApprovalError("invalid_payload", str(exc.errors(include_url=False))) from exc
    rule = policy.policy()[action]
    en, kn, amount, recipient = policy.summarise(action, clean, case.beneficiary_name)
    req = ApprovalRequest(
        case_id=case_id,
        action=action,
        payload_json=policy.canonical(clean),
        payload_hash=policy.payload_hash(case_id, action, clean),
        summary_en=en,
        summary_kn=kn,
        amount_inr=amount,
        recipient=recipient,
        reason=reason,
        citations_json=json.dumps(citations),
        approver=rule["approver"],
        requested_by=requested_by,
        expires_at=now() + timedelta(hours=int(rule.get("expires_hours", 72))),
    )
    db.add(req)
    db.flush()
    link = new_link(req) if req.approver == "family" else None
    write_audit(
        db,
        "approval_requested",
        case_id,
        f"approval {req.id}: {action} ({req.approver}) by {requested_by}",
        requested_by,
    )
    return req, link


def expire_if_due(db: Session, req: ApprovalRequest) -> None:
    if req.status in ("pending", "approved") and req.expires_at and naive(req.expires_at) < now():
        req.status = "expired"
        write_audit(db, "approval_expired", req.case_id, f"approval {req.id}: {req.action}", "system")


def by_token(db: Session, token: str) -> ApprovalRequest:
    req = db.query(ApprovalRequest).filter(ApprovalRequest.token_hash == _token_hash(token)).first() if token else None
    if req is None:
        raise ApprovalError("link_not_found", "This approval link is not valid.", 404)
    expire_if_due(db, req)
    return req


def require_pending(req: ApprovalRequest) -> None:
    if req.status != "pending":
        raise ApprovalError(f"already_{req.status}", f"This request is already {req.status}.", 409)


def decide(
    db: Session, req: ApprovalRequest, approve: bool, *, method: str, approver_ref: str, actor: str, note: str = ""
) -> None:
    require_pending(req)
    req.status = "approved" if approve else "rejected"
    req.method = method
    req.approver_ref = approver_ref
    req.decided_by = actor
    req.decision_note = note
    req.decided_at = now()
    write_audit(
        db,
        f"approval_{req.status}",
        req.case_id,
        f"approval {req.id}: {req.action} via {method} ({approver_ref})",
        actor,
    )


def out(req: ApprovalRequest, public: bool = False) -> dict:
    rule = policy.policy().get(req.action, {})
    data = {
        "id": req.id,
        "case_id": req.case_id,
        "action": req.action,
        "label_en": rule.get("label_en", req.action),
        "label_kn": rule.get("label_kn", req.action),
        "summary_en": req.summary_en,
        "summary_kn": req.summary_kn,
        "amount_inr": float(req.amount_inr) if req.amount_inr is not None else None,
        "recipient": req.recipient,
        "status": req.status,
        "approver": req.approver,
        "expires_at": req.expires_at.isoformat() if req.expires_at else None,
    }
    if public:
        return data
    return {
        **data,
        "payload": json.loads(req.payload_json or "{}"),
        "payload_hash": req.payload_hash,
        "reason": req.reason,
        "citations": json.loads(req.citations_json or "[]"),
        "method": req.method,
        "approver_ref": req.approver_ref,
        "requested_by": req.requested_by,
        "decided_by": req.decided_by,
        "decision_note": req.decision_note,
        "result": json.loads(req.result_json or "{}"),
        "executed_at": req.executed_at.isoformat() if req.executed_at else None,
    }
