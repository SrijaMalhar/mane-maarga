"""Run the case agent and read its runs. The agent proposes; people approve."""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..agents.providers import ProviderError, get_provider
from ..agents.runtime import run_agent, run_out
from ..core.config import env
from ..core.security import Authenticated, Operator
from ..database import get_db
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
