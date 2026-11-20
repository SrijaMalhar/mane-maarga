"""Money ladder: the exact cash gap before each instalment, split into
a timing gap (bridged until an instalment lands) and a funding gap (cost the subsidy never covers)."""
from __future__ import annotations
from .rules import RulePack


def build_ladder(pack: RulePack, total_cost: float, own_savings: float = 0.0,
                 scheme_loan: float = 0.0, extra_grants: float = 0.0) -> dict:
    """Stage k's cost must be paid before instalment k arrives (released after stage k is verified).
    gap_k = max(0, cumulative cost through k - (savings + loan + grants + instalments received before k)).
    funding gap F = max(0, total cost - all inflows). timing gap_k = max(0, gap_k - F)."""
    if total_cost <= 0:
        raise ValueError("total_cost must be positive")
    scheme_loan = min(scheme_loan, pack.scheme_loan_max)
    subsidy = pack.unit_assistance
    base_inflow = own_savings + scheme_loan + extra_grants
    cum_cost = cum_received = 0.0
    rows = []
    gaps = []
    for s in pack.stages:
        cost = total_cost * s["cost_share"]
        inst = subsidy * s["instalment_share"]
        cum_cost += cost
        gap = max(0.0, cum_cost - (base_inflow + cum_received))
        gaps.append(gap)
        cum_received += inst
        rows.append({"stage": s["id"], "label": s["label"], "cost": round(cost), "instalment_after": round(inst),
                     "cum_cost": round(cum_cost), "cum_instalments": round(cum_received)})
    funding_gap = max(0.0, total_cost - (base_inflow + subsidy))
    for row, gap in zip(rows, gaps):
        row["cash_gap_before_instalment"] = round(gap)
        row["timing_gap"] = round(max(0.0, gap - funding_gap))
    return {
        "total_cost": round(total_cost),
        "subsidy": subsidy,
        "own_savings": own_savings,
        "scheme_loan": scheme_loan,
        "funding_gap": round(funding_gap),
        "peak_timing_gap": max(r["timing_gap"] for r in rows),
        "rungs": rows,
    }
