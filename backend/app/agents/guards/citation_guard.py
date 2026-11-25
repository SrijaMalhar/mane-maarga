"""The citation guard: a message reaches the operator only if every claim in it is backed.

- Every cited clause must exist in the rule pack in force.
- Every rupee figure in the message must come from a tool result in this run, or be the value of
  a clause the message cites. The model may explain numbers; it may not invent them.
- A message with an English part must have a Kannada part, and the reverse.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from ...engine.rules import RulePack
from ...lib_money import amounts_in


@dataclass
class GuardResult:
    ok: bool
    problems: list[str] = field(default_factory=list)
    unverified_citations: list[str] = field(default_factory=list)


def _numbers(value: Any, out: set[int]) -> set[int]:
    if isinstance(value, bool):
        return out
    if isinstance(value, int | float):
        out.add(round(value))
    elif isinstance(value, dict):
        for v in value.values():
            _numbers(v, out)
    elif isinstance(value, list):
        for v in value:
            _numbers(v, out)
    return out


def check(
    message_en: str, message_kn: str, citations: list[str], tool_results: list[dict], pack: RulePack
) -> GuardResult:
    problems: list[str] = []
    known = pack.clause_ids
    unknown = [c for c in citations if c not in known]
    if unknown:
        problems.append(f"cites clauses that do not exist: {', '.join(unknown)}")
    cited_values = {round(c["value"]) for cid in citations if cid in known and (c := pack.clause(cid)) and "value" in c}
    allowed = _numbers(tool_results, set()) | cited_values
    for amount in sorted(set(amounts_in(message_en) + amounts_in(message_kn))):
        if amount not in allowed:
            problems.append(f"₹{amount} does not come from a tool result or a cited clause")
    if bool(message_en.strip()) != bool(message_kn.strip()):
        problems.append("message must be given in both English and Kannada")
    unverified = [c for c in citations if c in known and not pack.clause(c)["verified"]]  # type: ignore[index]
    return GuardResult(ok=not problems, problems=problems, unverified_citations=unverified)
