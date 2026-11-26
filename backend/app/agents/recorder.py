"""The Flight Recorder: every agent step is sealed into a hash chain, and a run can be replayed.

Seal: each step's seal is sha256(previous seal + the step's canonical content). The run's seal
covers the last step and the run's outcome. Editing any stored step, or deleting one, changes
every seal after it, so verify() finds the first step that no longer matches.

Replay: read-only tool calls are run again with the recorded arguments and compared with what
the agent saw. Tools that write or need approval are never re-run.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from sqlalchemy.orm import Session

from ..core.audit import write_audit
from ..models import AgentRun, AgentStep
from .tools import REGISTRY, ToolContext

GENESIS = "0" * 64
VOLATILE = {"_injection_flags"}


def _canon(value: Any) -> str:
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"), default=str)


def step_content(s: AgentStep) -> dict:
    return {
        "idx": s.idx,
        "phase": s.phase,
        "thought": s.thought_summary or "",
        "tool": s.tool,
        "args": json.loads(s.args_json or "{}"),
        "result": json.loads(s.result_json or "{}"),
        "error": s.error,
        "message_en": s.message_en or "",
        "message_kn": s.message_kn or "",
        "citations": json.loads(s.citations_json or "[]"),
        "ms": f"{float(s.ms or 0):.2f}",
    }


def run_content(r: AgentRun) -> dict:
    return {
        "id": r.id,
        "case_id": r.case_id,
        "provider": r.provider,
        "goal": r.goal,
        "status": r.status,
        "message_en": r.message_en or "",
        "message_kn": r.message_kn or "",
        "citations": json.loads(r.citations_json or "[]"),
    }


def seal(prev: str, content: dict) -> str:
    return hashlib.sha256((prev + _canon(content)).encode()).hexdigest()


def last_seal(db: Session, run_id: int) -> str:
    s = (
        db.query(AgentStep)
        .filter(AgentStep.run_id == run_id)
        .order_by(AgentStep.idx.desc(), AgentStep.id.desc())
        .first()
    )
    return (s.seal or GENESIS) if s else GENESIS


def steps_of(db: Session, run_id: int) -> list[AgentStep]:
    return db.query(AgentStep).filter(AgentStep.run_id == run_id).order_by(AgentStep.idx, AgentStep.id).all()


def verify(db: Session, run: AgentRun) -> dict:
    steps = steps_of(db, run.id)
    if not run.seal:
        return {"state": "unsealed", "checked": 0, "of": len(steps), "broken_at": None, "seal": None}
    prev = GENESIS
    for n, s in enumerate(steps):
        expected = seal(prev, step_content(s))
        if s.seal != expected:
            return {"state": "broken", "checked": n, "of": len(steps), "broken_at": s.idx, "seal": run.seal}
        prev = expected
    if run.seal != seal(prev, run_content(run)):
        return {"state": "broken", "checked": len(steps), "of": len(steps), "broken_at": "outcome", "seal": run.seal}
    return {"state": "intact", "checked": len(steps), "of": len(steps), "broken_at": None, "seal": run.seal}


def _changed(before: Any, after: Any, path: str = "") -> list[str]:
    if isinstance(before, dict) and isinstance(after, dict):
        out: list[str] = []
        for k in sorted(set(before) | set(after)):
            if k in VOLATILE:
                continue
            out += _changed(before.get(k), after.get(k), f"{path}.{k}" if path else k)
        return out
    return [] if _canon(before) == _canon(after) else [path or "result"]


def replay(db: Session, run: AgentRun, actor: str) -> dict:
    """Run each recorded read-only tool call again and say whether today's answer is the same."""
    ctx = ToolContext(db=db, actor=f"replay:{actor}", run_id=run.id)
    out = []
    for s in steps_of(db, run.id):
        row: dict[str, Any] = {"idx": s.idx, "phase": s.phase, "tool": s.tool}
        t = REGISTRY.get(s.tool) if s.tool else None
        if t is None:
            row["outcome"] = "no_tool"
        elif t.side_effect != "none":
            row["outcome"] = "not_rerun"
            row["why"] = "changes data" if t.side_effect == "write" else "needs approval"
        else:
            recorded = json.loads(s.result_json or "{}")
            try:
                parsed = t.input_model.model_validate(json.loads(s.args_json or "{}"))
                now = t.output_model.model_validate(t.fn(ctx, parsed)).model_dump(mode="json")
                err = None
            except Exception as exc:  # a tool error is a result too: compare it with what was recorded
                now, err = {}, getattr(exc, "code", type(exc).__name__)
            if s.error or err:
                row["outcome"] = "same" if s.error == err else "differs"
                row["changed"] = [] if s.error == err else ["error"]
                row["error_then"], row["error_now"] = s.error, err
            else:
                changed = _changed(recorded, now)
                row["outcome"] = "differs" if changed else "same"
                row["changed"] = changed[:8]
        out.append(row)
    db.rollback()  # read-only tools should change nothing; make sure of it
    reran = [r for r in out if r["outcome"] in ("same", "differs")]
    differs = [r for r in reran if r["outcome"] == "differs"]
    summary = {"reran": len(reran), "same": len(reran) - len(differs), "differs": len(differs)}
    write_audit(db, "agent_run_replayed", run.case_id, f"run {run.id}: {_canon(summary)}", actor)
    db.commit()
    return {"run_id": run.id, "summary": summary, "steps": out}
