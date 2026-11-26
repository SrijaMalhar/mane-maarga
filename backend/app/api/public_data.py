"""Public, aggregate government figures the product is grounded in. No personal data; every figure is cited."""

import json
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter

router = APIRouter(prefix="/api/public-data", tags=["public data"])
DATA = Path(__file__).resolve().parents[1] / "public_data"


@lru_cache(maxsize=4)
def _load(name: str) -> dict:
    return json.loads((DATA / f"{name}.json").read_text(encoding="utf-8"))


@router.get("/pmayg/karnataka")
def pmayg_karnataka():
    """Karnataka PMAY-G progress from Parliament answers and PIB, with derived figures computed here."""
    d = _load("ka_pmayg_progress")
    k, i = d["latest"]["karnataka"], d["latest"]["india"]
    derived = {
        "karnataka_not_yet_complete": k["sanctioned"] - k["completed"],
        "karnataka_completion_pct": round(100 * k["completed"] / k["sanctioned"], 1),
        "india_completion_pct": round(100 * i["completed"] / i["sanctioned"], 1),
    }
    return {**d, "derived": derived}
