#!/usr/bin/env python3
"""Print an agent trace on two synthetic cases, with no server and no API key.

    make demo                (from the repo root)

Uses a throwaway SQLite database and the scripted mock provider. Shows each step's phase, tool,
result or error, and the guarded final message in English and Kannada.
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.mkdtemp()}/demo.db"

from app.agents.providers import MockProvider  # noqa: E402
from app.agents.runtime import run_agent, run_out  # noqa: E402
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models import Case  # noqa: E402


def show(title: str, run: dict) -> None:
    print(f"\n=== {title} · run {run['id']} · {run['status'].upper()} ===")
    for s in run["steps"]:
        line = f"{s['idx']:>2} {s['phase']:<7}"
        if s["tool"]:
            outcome = f"error={s['error']}" if s["error"] else json.dumps(s["result"], ensure_ascii=False)[:90]
            line += f" {s['tool']}({json.dumps(s['args'], ensure_ascii=False)[:50]}) -> {outcome}"
        elif s["phase"] == "CHECK":
            line += f" citation guard: {'pass' if not s['error'] else '; '.join(s['result']['problems'])}"
        else:
            line += f" {s['thought_summary'][:100]}"
        print(line)
    print(f"EN: {run['message_en']}\nKN: {run['message_kn']}\nCited: {', '.join(run['citations']) or '-'}")


def main() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    a = Case(
        beneficiary_name="Lakshmamma K (sample)",
        village="Hosahalli",
        taluk="Kunigal",
        status="planning",
        estimated_cost=300000,
        sanctioned_amount=120000,
    )
    b = Case(beneficiary_name="Manjunath S (sample)", village="Bidadi", taluk="Ramanagara", status="intake")
    db.add_all([a, b])
    db.commit()
    show("Happy path", run_out(db, run_agent(db, a.id, "demo", MockProvider("case_review"))))
    show("Recovery: no cost estimate", run_out(db, run_agent(db, b.id, "demo", MockProvider("case_review"))))
    show("Blocked: invented grant", run_out(db, run_agent(db, a.id, "demo", MockProvider("invented_figure"))))
    db.close()


if __name__ == "__main__":
    main()
