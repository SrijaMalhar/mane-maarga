"""The agent loop: PLAN, ACT, CHECK, RECOVER, ASK, DONE. At most 12 steps.

Each turn the provider returns one Decision. The runtime, not the model:
- runs the tool through the registry (validated, audited, side effects declared);
- turns a tool error into a RECOVER step and shows the error to the provider;
- runs the citation guard before any message reaches the operator, and blocks it if it fails twice;
- records every step in agent_steps, so a run can be replayed and explained.
"""

from __future__ import annotations

import json
import time
from datetime import UTC, date, datetime
from pathlib import Path

from sqlalchemy.orm import Session

from ..core.audit import write_audit
from ..engine.rules import load_pack
from ..models import AgentRun, AgentStep, Case
from .guards.citation_guard import check as citation_check
from .guards.injection_guard import guard_result
from .providers import Decision, Observation, Provider, ProviderError, Turn
from .recorder import last_seal, run_content, seal, step_content
from .tools import REGISTRY, ToolContext, ToolError, call_tool, tool_specs

MAX_STEPS = 12
MAX_GUARD_FAILURES = 2
PROMPTS = Path(__file__).parent / "prompts"


def system_prompt(language: str) -> str:
    name = "case_manager.kn.md" if language == "kn" else "case_manager.en.md"
    return (PROMPTS / name).read_text(encoding="utf-8")


def _step(
    db: Session,
    run: AgentRun,
    idx: int,
    phase: str,
    d: Decision | None = None,
    *,
    tool: str | None = None,
    args: dict | None = None,
    result: dict | None = None,
    error: str | None = None,
    ms: float = 0,
    message_en: str | None = None,
    message_kn: str | None = None,
) -> None:
    prev = last_seal(db, run.id)
    step = AgentStep(
        run_id=run.id,
        idx=idx,
        phase=phase,
        thought_summary=d.thought_summary if d else "",
        tool=tool,
        args_json=json.dumps(args or {}),
        result_json=json.dumps(result or {}, ensure_ascii=False),
        error=error,
        message_en=message_en if message_en is not None else (d.message_en if d else ""),
        message_kn=message_kn if message_kn is not None else (d.message_kn if d else ""),
        citations_json=json.dumps(d.citations if d else []),
        ms=round(ms, 2),
    )
    step.seal = seal(prev, step_content(step))
    db.add(step)
    db.flush()


def _finish(
    db: Session, run: AgentRun, status: str, d: Decision | None = None, note_en: str = "", note_kn: str = ""
) -> AgentRun:
    run.status = status
    run.message_en = d.message_en if d else note_en
    run.message_kn = d.message_kn if d else note_kn
    run.citations_json = json.dumps(d.citations if d else [])
    run.finished_at = datetime.now(UTC)
    db.flush()
    run.seal = seal(last_seal(db, run.id), run_content(run))
    write_audit(db, "agent_run_finished", run.case_id, f"run {run.id}: {status} via {run.provider}", run.created_by)
    db.commit()
    return run


def run_agent(
    db: Session,
    case_id: int,
    actor: str,
    provider: Provider,
    goal: str = "Review this case and say what to do next.",
    language: str = "en",
) -> AgentRun:
    if db.get(Case, case_id) is None:
        raise LookupError(f"Case {case_id} does not exist")
    pack = load_pack("KA", on=date.today())
    run = AgentRun(case_id=case_id, provider=provider.name, goal=goal, language=language, created_by=actor)
    db.add(run)
    db.commit()
    ctx = ToolContext(db=db, actor=f"agent:{actor}", run_id=run.id)
    turn = Turn(
        case_id=case_id, goal=goal, language=language, system_prompt=system_prompt(language), tools=tool_specs()
    )
    results: list[dict] = []
    guard_failures = 0
    idx = 0

    while idx < MAX_STEPS:
        idx += 1
        started = time.perf_counter()
        try:
            d = provider.decide(turn)
        except ProviderError as exc:
            _step(db, run, idx, "RECOVER", error="provider_error", message_en=str(exc), message_kn="")
            return _finish(
                db,
                run,
                "failed",
                note_en=f"The model could not answer: {exc}",
                note_kn="ಮಾದರಿ ಉತ್ತರಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ನಂತರ ಪ್ರಯತ್ನಿಸಿ.",
            )

        if d.action is not None:
            name = d.action.tool
            phase = "RECOVER" if turn.last is not None and turn.last.error else "ACT"
            if name not in REGISTRY:
                obs = Observation(tool=name, error="unknown_tool", message=f"No tool named '{name}'")
                _step(
                    db,
                    run,
                    idx,
                    phase,
                    d,
                    tool=name,
                    args=d.action.args,
                    error=obs.error,
                    ms=(time.perf_counter() - started) * 1000,
                )
            else:
                try:
                    result = call_tool(ctx, name, d.action.args)
                    results.append(result)
                    view, flags = guard_result(name, result)
                    obs = Observation(tool=name, result=result, model_view=view, flags=flags)
                except ToolError as exc:
                    obs = Observation(tool=name, error=exc.code, message=exc.message)
                _step(
                    db,
                    run,
                    idx,
                    phase,
                    d,
                    tool=name,
                    args=d.action.args,
                    result={**(obs.result or {}), "_injection_flags": obs.flags} if obs.flags else obs.result,
                    error=obs.error,
                    ms=(time.perf_counter() - started) * 1000,
                )
                if obs.flags:
                    write_audit(
                        db, "injection_flagged", case_id, f"run {run.id} step {idx}: {name}: {obs.flags[:3]}", "system"
                    )
            turn.history.append((d, obs))
            continue

        if d.status == "continue":
            _step(db, run, idx, "PLAN", d)
            turn.history.append((d, Observation(tool=None)))
            continue

        # ask or done: the message is about to reach the operator, so CHECK it first.
        guard = citation_check(d.message_en, d.message_kn, d.citations, results, pack)
        _step(
            db,
            run,
            idx,
            "CHECK",
            d,
            result={"ok": guard.ok, "problems": guard.problems, "unverified_citations": guard.unverified_citations},
            error=None if guard.ok else "citation_guard",
        )
        if not guard.ok:
            guard_failures += 1
            if guard_failures >= MAX_GUARD_FAILURES:
                return _finish(
                    db,
                    run,
                    "blocked",
                    note_en="Withheld: the answer stated figures or rules that could not be traced to a tool result or a cited clause.",
                    note_kn="ತಡೆಹಿಡಿಯಲಾಗಿದೆ: ಉತ್ತರದ ಅಂಕಿ ಅಥವಾ ನಿಯಮಗಳಿಗೆ ಆಧಾರ ಸಿಗಲಿಲ್ಲ.",
                )
            turn.history.append((d, Observation(tool=None, error="citation_guard", message="; ".join(guard.problems))))
            continue
        idx += 1
        if d.status == "ask":
            _step(db, run, idx, "ASK", d)
            return _finish(db, run, "asked", d)
        _step(db, run, idx, "DONE", d)
        return _finish(db, run, "done", d)

    return _finish(
        db,
        run,
        "step_limit",
        note_en=f"Stopped after {MAX_STEPS} steps without an answer.",
        note_kn=f"{MAX_STEPS} ಹಂತಗಳ ನಂತರವೂ ಉತ್ತರ ಸಿಗದೆ ನಿಲ್ಲಿಸಲಾಗಿದೆ.",
    )


def run_out(db: Session, run: AgentRun) -> dict:
    steps = db.query(AgentStep).filter(AgentStep.run_id == run.id).order_by(AgentStep.idx, AgentStep.id).all()
    return {
        "id": run.id,
        "case_id": run.case_id,
        "provider": run.provider,
        "goal": run.goal,
        "language": run.language,
        "status": run.status,
        "message_en": run.message_en,
        "message_kn": run.message_kn,
        "citations": json.loads(run.citations_json or "[]"),
        "created_by": run.created_by,
        "created_at": str(run.created_at) if run.created_at else None,
        "finished_at": str(run.finished_at) if run.finished_at else None,
        "seal": run.seal,
        "steps": [
            {
                "idx": s.idx,
                "phase": s.phase,
                "thought_summary": s.thought_summary,
                "tool": s.tool,
                "args": json.loads(s.args_json or "{}"),
                "result": json.loads(s.result_json or "{}"),
                "error": s.error,
                "message_en": s.message_en,
                "message_kn": s.message_kn,
                "citations": json.loads(s.citations_json or "[]"),
                "ms": float(s.ms or 0),
                "seal": s.seal,
            }
            for s in steps
        ],
    }
