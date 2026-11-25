"""Rule packs: dated, cited JSON per state, scheme and budget year (see rules_data/schema.json).

Packs live at rules_data/<STATE>/<scheme>/<budget-year>.json. `load_pack` picks the pack in force
on a date. `check_eligibility` evaluates the pack's eligibility and exclusion rules over case facts
and returns a verdict with the clause IDs behind it. Facts that are missing are reported as
unknown, never guessed.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date
from functools import lru_cache
from pathlib import Path
from typing import Any

DATA = Path(__file__).parent / "rules_data"


@dataclass(frozen=True)
class RulePack:
    raw: dict

    @property
    def pack_id(self) -> str:
        return self.raw["pack_id"]

    def amount(self, key: str) -> float:
        for a in self.raw["amounts"]:
            if a["key"] == key:
                return a["value"]
        raise KeyError(f"{self.pack_id} has no amount '{key}'")

    def amount_clause(self, key: str) -> str:
        return next(a["id"] for a in self.raw["amounts"] if a["key"] == key)

    @property
    def unit_assistance(self) -> int:
        return int(self.amount("unit_assistance"))

    @property
    def scheme_loan_max(self) -> int:
        return int(self.amount("scheme_loan_max"))

    @property
    def stages_verified(self) -> bool:
        return bool(self.raw["stages"]["verified"])

    @property
    def stage_note(self) -> str:
        return self.raw["stages"]["note"]

    @property
    def assumptions(self) -> list[str]:
        return [] if self.stages_verified else [self.stage_note]

    @property
    def stages(self) -> list[dict]:
        # `label` keeps older callers (the ladder) working; packs store label_en and label_kn.
        return [{**s, "label": s["label_en"]} for s in self.raw["stages"]["items"]]

    def effective_scheme_loan_rate(self, lender_base_rate_pa: float) -> float:
        """The scheme loan's rate is the lender's base rate minus the pack's reduction. No base rate is assumed."""
        return max(0.0, lender_base_rate_pa - self.amount("scheme_loan_rate_reduction_points") / 100)

    def clauses(self) -> list[dict]:
        r = self.raw
        return r["amounts"] + r["eligibility_rules"] + r["exclusion_rules"] + r["timelines"] + r["land_route"]

    def clause(self, clause_id: str) -> dict | None:
        return next((c for c in self.clauses() if c["id"] == clause_id), None)

    @property
    def clause_ids(self) -> set[str]:
        return {c["id"] for c in self.clauses()}


def pack_files() -> list[Path]:
    return sorted(p for p in DATA.rglob("*.json") if p.name != "schema.json")


@lru_cache(maxsize=64)
def _read(path: str) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def load_pack(state: str = "KA", scheme: str = "PMAY-G", on: date | None = None, root: Path | None = None) -> RulePack:
    """The pack for this state and scheme in force on `on`. The latest effective_from wins on overlap."""
    on = on or date.today()
    files = sorted(p for p in (root or DATA).rglob("*.json") if p.name != "schema.json")
    best: dict | None = None
    for f in files:
        d = _read(str(f))
        if d["state"] != state or d["scheme"] != scheme:
            continue
        start = date.fromisoformat(d["effective_from"])
        end = date.fromisoformat(d["effective_to"]) if d["effective_to"] else None
        if start <= on and (end is None or on <= end):
            if best is None or start > date.fromisoformat(best["effective_from"]):
                best = d
    if best is None:
        raise LookupError(f"No rule pack for {state}/{scheme} on {on}")
    return RulePack(best)


# --- A small JSON-logic evaluator: var, ==, !=, >, >=, <, <=, and, or, !, in -------------------

_MISSING = object()


class UnknownFact(Exception):
    """Raised when a rule needs a fact the case does not have."""


def evaluate(logic: Any, facts: dict) -> Any:
    if not isinstance(logic, dict):
        return logic
    ((op, args),) = logic.items()
    if op == "var":
        value = facts.get(args, _MISSING)
        if value is _MISSING or value is None:
            raise UnknownFact(args)
        return value
    if not isinstance(args, list):
        args = [args]
    if op == "and":
        return all(evaluate(a, facts) for a in args)
    if op == "or":
        return any(evaluate(a, facts) for a in args)
    if op == "!":
        return not evaluate(args[0], facts)
    a, b = (evaluate(x, facts) for x in args)
    ops = {
        "==": lambda: a == b,
        "!=": lambda: a != b,
        ">": lambda: a > b,
        ">=": lambda: a >= b,
        "<": lambda: a < b,
        "<=": lambda: a <= b,
        "in": lambda: a in b,
    }
    if op not in ops:
        raise ValueError(f"Unsupported JSON-logic operator: {op}")
    return ops[op]()


def check_eligibility(pack: RulePack, facts: dict) -> dict:
    """Verdict plus the clauses that passed, failed or could not be decided.

    eligible: every eligibility rule passes and no exclusion applies.
    not_eligible: an eligibility rule fails or an exclusion applies (failed[] says which).
    needs_information: nothing failed, but some rules need facts the case does not have.
    """
    passed: list[dict] = []
    failed: list[dict] = []
    unknown: list[dict] = []

    def row(rule: dict, kind: str) -> dict:
        return {
            "clause_id": rule["id"],
            "kind": kind,
            "text_en": rule["text_en"],
            "text_kn": rule["text_kn"],
            "verified": rule["verified"],
            "facts": rule["facts"],
            "source_url": rule["source"]["url"],
        }

    for rule in pack.raw["eligibility_rules"]:
        try:
            (passed if evaluate(rule["logic"], facts) else failed).append(row(rule, "eligibility"))
        except UnknownFact:
            unknown.append(row(rule, "eligibility"))
    for rule in pack.raw["exclusion_rules"]:
        try:
            (failed if evaluate(rule["logic"], facts) else passed).append(row(rule, "exclusion"))
        except UnknownFact:
            unknown.append(row(rule, "exclusion"))

    verdict = "not_eligible" if failed else "needs_information" if unknown else "eligible"
    return {
        "pack_id": pack.pack_id,
        "verdict": verdict,
        "passed": passed,
        "failed": failed,
        "unknown": unknown,
        "missing_facts": sorted({f for r in unknown for f in r["facts"] if facts.get(f) is None}),
        "clause_ids": [r["clause_id"] for r in failed + unknown + passed],
        "unverified_clauses_used": [r["clause_id"] for r in failed + passed if not r["verified"]],
    }
