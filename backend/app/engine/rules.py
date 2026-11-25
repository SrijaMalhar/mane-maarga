"""Rule packs: JSON per state and budget year with effective dates.

The ladder only needs the unit assistance, the scheme-loan cap and the stage split.
`check_eligibility` is kept for tests and future use but is deliberately NOT exposed over HTTP:
the workspace makes no eligibility determinations, and the rule citations still say VERIFY."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date
from pathlib import Path

DATA = Path(__file__).parent / "rules_data"


@dataclass(frozen=True)
class RulePack:
    raw: dict

    @property
    def unit_assistance(self) -> int:
        return self.raw["unit_assistance"]

    @property
    def scheme_loan_max(self) -> int:
        return self.raw["scheme_loan"]["max_amount"]

    @property
    def stages_verified(self) -> bool:
        return bool(self.raw.get("stages_verified", False))

    @property
    def assumptions(self) -> list[str]:
        return [] if self.stages_verified else [self.raw["stage_note"]]

    def effective_scheme_loan_rate(self, lender_base_rate_pa: float) -> float:
        """PIB says '3% reduced interest rate': the lender's base rate minus 3 points. No base rate is assumed."""
        return max(0.0, lender_base_rate_pa - self.raw["scheme_loan"]["rate_reduction_points"])

    @property
    def stages(self) -> list[dict]:
        return self.raw["stages"]


def load_pack(state: str = "KA", scheme: str = "PMAY-G", on: date | None = None) -> RulePack:
    on = on or date.today()
    best = None
    for f in sorted(DATA.glob("*.json")):
        d = json.loads(f.read_text(encoding="utf-8"))
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


def check_eligibility(pack: RulePack, facts: dict) -> dict:
    """Return per-rule results with the rule's citation. Missing facts are reported, never guessed."""
    results, missing = [], []
    for rule in pack.raw["eligibility_rules"]:
        field = rule["field"]
        if field not in facts or facts[field] is None:
            missing.append(field)
            results.append({"rule": rule["id"], "status": "unknown", "text": rule["text"], "cite": rule["cite"]})
            continue
        ok = facts[field] == rule["must_be"]
        results.append(
            {"rule": rule["id"], "status": "pass" if ok else "fail", "text": rule["text"], "cite": rule["cite"]}
        )
    if any(r["status"] == "fail" for r in results):
        verdict = "not_eligible"
    elif missing:
        verdict = "need_more_information"
    else:
        verdict = "eligible"
    return {"verdict": verdict, "results": results, "missing": missing}
