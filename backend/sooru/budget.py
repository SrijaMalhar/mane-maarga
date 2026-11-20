"""Likely and high-side budget from local quotes. Transparent: quantile of quotes plus an uncertainty margin."""
from __future__ import annotations
import statistics


def budget_band(quotes: list[float], high_margin: float = 0.15) -> dict:
    if len(quotes) < 3:
        raise ValueError("need at least 3 quotes for a band")
    likely = statistics.median(quotes)
    xs = sorted(quotes)
    p80 = xs[min(len(xs) - 1, int(0.8 * len(xs)))]
    high = max(p80, likely) * (1 + high_margin)
    return {"likely": round(likely), "high": round(high), "n_quotes": len(quotes)}
