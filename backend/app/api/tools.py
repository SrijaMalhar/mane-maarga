"""Tool endpoints for machine callers, and approval decisions for people.

/api/tools/* needs the X-Service-Token header. Every call is validated and audited by the registry.
Approvals are decided by an administrator; only then does a case's status change.
"""

import hmac
import json
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..agents.tools import REGISTRY, ToolContext, ToolError, call_tool, tool_specs
from ..core import config
from ..core.audit import write_audit
from ..core.security import Admin, Authenticated
from ..database import get_db
from ..models import ApprovalRequest, Case

router = APIRouter(tags=["tools"])


def service_caller(x_service_token: str = Header(default="")) -> str:
    if not config.SERVICE_TOKEN:
        raise HTTPException(status_code=503, detail="Tool endpoints are disabled: no service token configured")
    if not hmac.compare_digest(x_service_token.encode(), config.SERVICE_TOKEN.encode()):
        raise HTTPException(status_code=401, detail="Invalid service token")
    return "service"


@router.get("/api/tools/openapi.json")
def tools_spec(caller: str = Depends(service_caller)):
    return {"openapi": "3.1.0", "info": {"title": "Mane Maarga tools", "version": "1"}, "tools": tool_specs()}


@router.post("/api/tools/{name}")
def run_tool(name: str, args: dict, caller: str = Depends(service_caller), db: Session = Depends(get_db)):
    if name not in REGISTRY:
        raise HTTPException(status_code=404, detail=f"No tool named '{name}'")
    try:
        return {"tool": name, "result": call_tool(ToolContext(db=db, actor=caller), name, args)}
    except ToolError as exc:
        status = 404 if exc.code.endswith("not_found") else 422
        raise HTTPException(status_code=status, detail={"error": exc.code, "message": exc.message}) from exc


def _approval_out(r: ApprovalRequest) -> dict:
    return {
        "id": r.id,
        "case_id": r.case_id,
        "action": r.action,
        "payload": json.loads(r.payload_json or "{}"),
        "reason": r.reason,
        "citations": json.loads(r.citations_json or "[]"),
        "status": r.status,
        "requested_by": r.requested_by,
        "decided_by": r.decided_by,
        "decision_note": r.decision_note,
    }


@router.get("/api/cases/{case_id}/approvals")
def list_approvals(case_id: int, user: Authenticated, db: Session = Depends(get_db)):
    rows = (
        db.query(ApprovalRequest).filter(ApprovalRequest.case_id == case_id).order_by(ApprovalRequest.id.desc()).all()
    )
    return [_approval_out(r) for r in rows]


class Decision(BaseModel):
    approve: bool
    note: str = Field(default="", max_length=2000)


@router.post("/api/approvals/{approval_id}/decide")
def decide(approval_id: int, body: Decision, user: Admin, db: Session = Depends(get_db)):
    r = db.get(ApprovalRequest, approval_id)
    if r is None:
        raise HTTPException(status_code=404, detail="Approval request not found")
    if r.status != "pending":
        raise HTTPException(status_code=409, detail=f"Already {r.status}")
    r.status = "approved" if body.approve else "rejected"
    r.decided_by = user.username
    r.decision_note = body.note
    r.decided_at = datetime.now(UTC)
    payload = json.loads(r.payload_json or "{}")
    if body.approve and r.action == "case_status_change" and payload.get("new_status"):
        case = db.get(Case, r.case_id)
        old = case.status
        case.status = payload["new_status"]
        write_audit(db, "case_status_changed", r.case_id, f"{old} -> {case.status} (approval {r.id})", user.username)
    write_audit(db, f"approval_{r.status}", r.case_id, f"approval {r.id}: {r.action}", user.username)
    db.commit()
    return _approval_out(r)
