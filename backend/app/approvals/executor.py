"""The executor: the only code that runs a gated action.

It runs an action only if the approval is approved, not expired and not already run, and only if the payload
still hashes to what the approver saw. The status moves approved -> executing in one conditional UPDATE, so
two callers racing on the same approval cannot both run it. External effects (portal, payment, sharing)
are Simulated: they are written to the outbox, not sent anywhere.
"""

from __future__ import annotations

import json
from collections.abc import Callable

from sqlalchemy import update
from sqlalchemy.orm import Session

from ..channels import outbox
from ..channels.otp import now
from ..core.audit import write_audit
from ..lib_money import format_inr
from ..models import ApprovalRequest, Case, CaseFundingSource
from . import policy
from .service import ApprovalError, expire_if_due

Handler = Callable[[Session, ApprovalRequest, Case, dict], dict]


def _status(db: Session, req: ApprovalRequest, case: Case, p: dict) -> dict:
    old = case.status
    case.status = p["new_status"]
    write_audit(
        db, "case_status_changed", case.id, f"{old} -> {case.status} (approval {req.id})", req.decided_by or "system"
    )
    return {"from": old, "to": case.status}


def _portal(db: Session, req: ApprovalRequest, case: Case, p: dict) -> dict:
    m = outbox.send(
        db,
        "portal",
        p["portal"],
        f"Application for case {case.id} with documents {p.get('document_ids', [])}",
        subject="Portal submission",
        case_id=case.id,
        approval_id=req.id,
    )
    return {"outbox_id": m.id, "simulated": True}


def _tranche(db: Session, req: ApprovalRequest, case: Case, p: dict) -> dict:
    m = outbox.send(
        db,
        "portal",
        "PMAY-G tranche request",
        f"Request {p['stage']} instalment of {format_inr(p['amount_inr'])} to {p['payee']}",
        subject="Tranche request",
        case_id=case.id,
        approval_id=req.id,
    )
    return {"outbox_id": m.id, "simulated": True}


def _loan(db: Session, req: ApprovalRequest, case: Case, p: dict) -> dict:
    src = db.get(CaseFundingSource, p["funding_source_id"]) if p.get("funding_source_id") else None
    if src is not None and src.case_id == case.id:
        src.status = "confirmed"
    else:
        src = CaseFundingSource(
            case_id=case.id,
            source_type="loan",
            source_name=p["lender"],
            amount=p["amount_inr"],
            status="confirmed",
            notes=f"Accepted by the family (approval {req.id})",
            created_by=req.approver_ref or "family",
        )
        db.add(src)
        db.flush()
    return {"funding_source_id": src.id, "status": "confirmed"}


def _payment(db: Session, req: ApprovalRequest, case: Case, p: dict) -> dict:
    m = outbox.send(
        db,
        "payment",
        p["payee"],
        f"Pay {format_inr(p['amount_inr'])} for {p['purpose']}",
        subject="Payment",
        case_id=case.id,
        approval_id=req.id,
    )
    return {"outbox_id": m.id, "simulated": True}


def _share(db: Session, req: ApprovalRequest, case: Case, p: dict) -> dict:
    m = outbox.send(
        db,
        "share",
        p["recipient"],
        f"Share documents {p['document_ids']} for {p['purpose']}",
        subject="Document sharing",
        case_id=case.id,
        approval_id=req.id,
    )
    return {"outbox_id": m.id, "simulated": True}


HANDLERS: dict[str, Handler] = {
    "change_case_status": _status,
    "submit_to_portal": _portal,
    "request_tranche": _tranche,
    "accept_loan": _loan,
    "pay_any_amount": _payment,
    "share_documents_with_third_party": _share,
}


def execute(db: Session, approval_id: int, actor: str) -> dict:
    req = db.get(ApprovalRequest, approval_id)
    if req is None:
        raise ApprovalError("approval_not_found", "Approval not found", 404)
    expire_if_due(db, req)
    payload = json.loads(req.payload_json or "{}")
    if policy.payload_hash(req.case_id, req.action, payload) != req.payload_hash:
        write_audit(db, "gated_action_blocked", req.case_id, f"approval {req.id}: payload changed after request", actor)
        db.commit()
        raise ApprovalError("payload_tampered", "The action no longer matches what was approved.", 409)
    if req.status != "approved":
        write_audit(db, "gated_action_blocked", req.case_id, f"approval {req.id}: {req.action} is {req.status}", actor)
        db.commit()
        code = "already_executed" if req.status in ("executed", "executing") else f"not_approved_{req.status}"
        raise ApprovalError(code, f"Cannot run: this request is {req.status}.", 409)
    claimed = db.execute(
        update(ApprovalRequest)
        .where(ApprovalRequest.id == req.id, ApprovalRequest.status == "approved")
        .values(status="executing")
    )
    if claimed.rowcount != 1:  # someone else got here first
        raise ApprovalError("already_executed", "Cannot run: this request is already running or done.", 409)
    db.refresh(req)
    try:
        result = HANDLERS[req.action](db, req, db.get(Case, req.case_id), payload)
    except Exception:
        db.rollback()
        db.execute(update(ApprovalRequest).where(ApprovalRequest.id == approval_id).values(status="approved"))
        db.commit()
        raise
    req.status = "executed"
    req.executed_at = now()
    req.result_json = json.dumps(result)
    write_audit(
        db, "gated_action_executed", req.case_id, f"approval {req.id}: {req.action} -> {json.dumps(result)}", actor
    )
    db.commit()
    return result
