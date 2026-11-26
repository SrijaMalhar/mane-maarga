"""Run the case agent and read its runs. The agent proposes; people approve."""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..agents.providers import ProviderError, get_provider
from ..agents.recorder import replay, verify
from ..agents.runtime import run_agent, run_out
from ..agents.tools import REGISTRY
from ..core.config import env
from ..core.security import Authenticated, Operator
from ..database import get_db
from ..engine.rules import load_pack
from ..models import AgentRun, Case

router = APIRouter(tags=["agent"])


class RunIn(BaseModel):
    goal: str = Field(default="Review this case and say what to do next.", min_length=3, max_length=500)
    language: Literal["en", "kn"] = "en"
    provider: Literal["mock", "lyzr"] | None = None
    script: str = Field(default="case_review", pattern="^[a-z0-9_]+$", max_length=40)


@router.post("/api/cases/{case_id}/agent/run", status_code=201)
def start_run(case_id: int, body: RunIn, user: Operator, db: Session = Depends(get_db)):
    if db.get(Case, case_id) is None:
        raise HTTPException(status_code=404, detail="Case not found")
    name = body.provider or env("AGENT_PROVIDER", "mock") or "mock"
    try:
        provider = get_provider(name, body.script)
    except (ProviderError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    run = run_agent(db, case_id, user.username, provider, body.goal, body.language)
    return run_out(db, run)


@router.get("/api/cases/{case_id}/agent/runs")
def list_runs(case_id: int, user: Authenticated, db: Session = Depends(get_db)):
    runs = db.query(AgentRun).filter(AgentRun.case_id == case_id).order_by(AgentRun.id.desc()).limit(20).all()
    return [run_out(db, r) for r in runs]


def _run_or_404(db: Session, run_id: int) -> AgentRun:
    run = db.get(AgentRun, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    return run


@router.get("/api/agent/runs/{run_id}/recording")
def recording(run_id: int, user: Authenticated, db: Session = Depends(get_db)):
    """The whole run as recorded, with each tool's side effect and whether the seal still holds."""
    run = _run_or_404(db, run_id)
    out = run_out(db, run)
    for s in out["steps"]:
        t = REGISTRY.get(s["tool"]) if s["tool"] else None
        s["side_effect"] = t.side_effect if t else None
    pack = load_pack("KA")
    out["rule_pack"] = {"id": pack.pack_id, "effective_from": pack.raw.get("effective_from")}
    out["verification"] = verify(db, run)
    return out


@router.post("/api/agent/runs/{run_id}/replay")
def replay_run(run_id: int, user: Authenticated, db: Session = Depends(get_db)):
    """Run the recorded read-only tool calls again and compare. Writes and gated tools are skipped."""
    return replay(db, _run_or_404(db, run_id), user.username)
