"""Rule packs v2: schema-valid, cited, dated; eligibility returns clause IDs and never guesses."""

import json
import shutil
import subprocess
import sys
from datetime import date
from pathlib import Path

import pytest

from app.engine.rules import DATA, check_eligibility, load_pack

PACK = load_pack("KA", on=date(2025, 6, 1))
P = "KA-PMAYG-2024-25"

# A household that passes every rule; each test changes one fact.
ELIGIBLE = {
    "housing_condition": "kutcha",
    "on_beneficiary_list": True,
    "kcc_limit": 0,
    "has_government_employee": False,
    "has_registered_non_agri_enterprise": False,
    "household_monthly_income": 9000,
    "pays_income_tax": False,
    "pays_professional_tax": False,
    "irrigated_land_acres": 1.0,
    "unirrigated_land_acres": 0.5,
}


def test_rules_lint_passes():
    root = Path(__file__).resolve().parents[1]
    run = subprocess.run([sys.executable, "scripts/rules_lint.py"], cwd=root, capture_output=True, text=True)
    assert run.returncode == 0, run.stdout


def test_amounts_come_from_the_pack_with_clause_ids():
    assert PACK.unit_assistance == 120000
    assert PACK.scheme_loan_max == 70000
    assert PACK.amount("toilet_grant") == 12000
    assert PACK.amount("min_house_size") == 25
    assert PACK.amount_clause("unit_assistance") == f"{P}:AM-01"
    assert PACK.stages_verified is False and PACK.assumptions


def test_a_household_that_meets_every_rule_is_eligible():
    out = check_eligibility(PACK, ELIGIBLE)
    assert out["verdict"] == "eligible"
    assert not out["failed"] and not out["unknown"]
    assert len(out["clause_ids"]) == 10


@pytest.mark.parametrize(
    "fact,value,clause",
    [
        ("kcc_limit", 50000, "EX-01"),
        ("has_government_employee", True, "EX-02"),
        ("has_registered_non_agri_enterprise", True, "EX-03"),
        ("household_monthly_income", 15001, "EX-04"),
        ("pays_income_tax", True, "EX-05"),
        ("pays_professional_tax", True, "EX-06"),
        ("irrigated_land_acres", 2.6, "EX-07"),
        ("unirrigated_land_acres", 5, "EX-08"),
    ],
)
def test_each_exclusion_rule_excludes_and_cites_its_clause(fact, value, clause):
    out = check_eligibility(PACK, {**ELIGIBLE, fact: value})
    assert out["verdict"] == "not_eligible"
    assert [r["clause_id"] for r in out["failed"]] == [f"{P}:{clause}"]


@pytest.mark.parametrize(
    "fact,boundary", [("household_monthly_income", 15000), ("irrigated_land_acres", 2.5), ("kcc_limit", 49999)]
)
def test_values_at_the_boundary_are_not_excluded(fact, boundary):
    assert check_eligibility(PACK, {**ELIGIBLE, fact: boundary})["verdict"] == "eligible"


def test_failed_eligibility_rule_and_unverified_clauses_are_reported():
    out = check_eligibility(PACK, {**ELIGIBLE, "housing_condition": "pucca", "unirrigated_land_acres": 6})
    assert {r["clause_id"] for r in out["failed"]} == {f"{P}:EL-01", f"{P}:EX-08"}
    assert f"{P}:EX-08" in out["unverified_clauses_used"]


def test_missing_facts_give_needs_information_not_a_guess():
    out = check_eligibility(PACK, {"housing_condition": "kutcha"})
    assert out["verdict"] == "needs_information"
    assert "household_monthly_income" in out["missing_facts"]
    assert not out["failed"]


def test_loader_picks_the_pack_in_force_on_the_date(tmp_path):
    root = tmp_path / "rules"
    shutil.copytree(DATA, root)
    newer = json.loads((root / "KA/pmayg/2024-25.json").read_text())
    newer.update(budget_year="2026-27", effective_from="2026-04-01", pack_id="KA-PMAYG-2026-27")
    (root / "KA/pmayg/2026-27.json").write_text(json.dumps(newer))
    assert load_pack("KA", on=date(2025, 6, 1), root=root).pack_id == "KA-PMAYG-2024-25"
    assert load_pack("KA", on=date(2026, 6, 1), root=root).pack_id == "KA-PMAYG-2026-27"
    with pytest.raises(LookupError):
        load_pack("KA", on=date(2023, 1, 1), root=root)
    with pytest.raises(LookupError):
        load_pack("XX", root=root)


def test_eligibility_endpoint_returns_verdict_and_clauses(client):
    r = client.post("/api/engine/eligibility", json={"facts": {**ELIGIBLE, "household_monthly_income": 20000}})
    assert r.status_code == 200
    body = r.json()
    assert body["verdict"] == "not_eligible"
    assert f"{P}:EX-04" in body["clause_ids"]
    clause = client.get(f"/api/engine/clauses/{P}:EX-04").json()
    assert clause["text_kn"] and clause["source"]["url"].startswith("https://")
    assert client.get(f"/api/engine/clauses/{P}:EX-99").status_code == 404


def test_public_karnataka_figures_are_cited_and_derived_in_code(client):
    body = client.get("/api/public-data/pmayg/karnataka").json()
    k = body["latest"]["karnataka"]
    assert body["derived"]["karnataka_not_yet_complete"] == k["sanctioned"] - k["completed"] == 362342
    assert body["derived"]["karnataka_completion_pct"] == 30.4 and body["derived"]["india_completion_pct"] == 73.4
    for point in [body["latest"], body["new_phase"], *body["series"]]:
        assert body["sources"][point["source"]]["url"].startswith("https://")
