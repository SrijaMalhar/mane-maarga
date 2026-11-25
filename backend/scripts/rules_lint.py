#!/usr/bin/env python3
"""Check every rule pack before it can ship.

Fails when a pack breaks the JSON Schema, a clause has no https source URL or no Kannada text,
a clause ID is duplicated or does not start with its pack ID, stage shares do not sum to 1, or a
rule's logic reads a fact it does not declare. Prints one line per problem.

    python scripts/rules_lint.py          (from backend/), or `make rules-lint` from the repo root
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[1] / "app" / "engine" / "rules_data"


def facts_in(logic) -> set[str]:
    if isinstance(logic, dict):
        if "var" in logic:
            return {logic["var"]}
        return set().union(*(facts_in(v) for v in logic.values()))
    if isinstance(logic, list):
        return set().union(*(facts_in(v) for v in logic)) if logic else set()
    return set()


def lint(path: Path, validator: Draft202012Validator) -> list[str]:
    pack = json.loads(path.read_text(encoding="utf-8"))
    rel = path.relative_to(ROOT)
    problems = [
        f"{rel}: schema: {'/'.join(map(str, e.path)) or '(root)'}: {e.message}" for e in validator.iter_errors(pack)
    ]
    if problems:
        return problems
    expected = f"{pack['state']}/{pack['scheme'].lower().replace('-', '')}/{pack['budget_year']}.json"
    if str(rel) != expected:
        problems.append(f"{rel}: should live at {expected}")
    seen: set[str] = set()
    for group in ("amounts", "eligibility_rules", "exclusion_rules", "timelines", "land_route"):
        for c in pack[group]:
            cid = c["id"]
            if cid in seen:
                problems.append(f"{rel}: {cid}: duplicate clause ID")
            seen.add(cid)
            if not cid.startswith(pack["pack_id"] + ":"):
                problems.append(f"{rel}: {cid}: clause ID must start with {pack['pack_id']}:")
            if not c["source"]["url"].startswith("https://"):
                problems.append(f"{rel}: {cid}: source URL must be https")
            if not c["text_kn"].strip():
                problems.append(f"{rel}: {cid}: missing Kannada text")
            if c["source"].get("official") is False and c["verified"]:
                problems.append(f"{rel}: {cid}: a secondary source cannot mark a clause verified")
            if "logic" in c and facts_in(c["logic"]) != set(c["facts"]):
                problems.append(
                    f"{rel}: {cid}: logic reads {sorted(facts_in(c['logic']))} but declares {sorted(c['facts'])}"
                )
    items = pack["stages"]["items"]
    for key in ("cost_share", "instalment_share"):
        total = round(sum(s[key] for s in items), 6)
        if total != 1:
            problems.append(f"{rel}: stages {key} sums to {total}, not 1")
    return problems


def main() -> int:
    validator = Draft202012Validator(json.loads((ROOT / "schema.json").read_text(encoding="utf-8")))
    packs = sorted(p for p in ROOT.rglob("*.json") if p.name != "schema.json")
    problems = [p for path in packs for p in lint(path, validator)]
    for p in problems:
        print(p)
    clauses = sum(
        len(json.loads(p.read_text())[g])
        for p in packs
        for g in ("amounts", "eligibility_rules", "exclusion_rules", "timelines", "land_route")
    )
    print(f"rules-lint: {len(packs)} pack(s), {clauses} clauses, {len(problems)} problem(s)")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
