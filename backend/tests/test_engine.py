from datetime import date
import pytest
from app.engine import affordability as aff
from app.engine.ladder import build_ladder
from app.engine.rules import check_eligibility, load_pack

PACK = load_pack("KA", on=date(2025, 1, 1))


def test_rule_pack_loads_and_dates_apply():
    assert PACK.unit_assistance == 120000
    assert PACK.scheme_loan_max == 70000
    with pytest.raises(LookupError):
        load_pack("KA", on=date(2020, 1, 1))  # before effective_from
    with pytest.raises(LookupError):
        load_pack("XX")


def test_eligibility_verdicts():
    ok = check_eligibility(PACK, {"owns_land": True, "owns_pucca_house": False, "on_scheme_list": True})
    assert ok["verdict"] == "eligible"
    bad = check_eligibility(PACK, {"owns_land": True, "owns_pucca_house": True, "on_scheme_list": True})
    assert bad["verdict"] == "not_eligible"
    unknown = check_eligibility(PACK, {"owns_land": True})
    assert unknown["verdict"] == "need_more_information"
    assert set(unknown["missing"]) == {"owns_pucca_house", "on_scheme_list"}
    assert all(r["cite"] for r in ok["results"])


def test_ladder_funding_gap_and_timing_gap():
    out = build_ladder(PACK, 500000, own_savings=20000, scheme_loan=70000)
    assert out["funding_gap"] == 500000 - (20000 + 70000 + 120000)
    assert len(out["rungs"]) == 4
    assert out["rungs"][-1]["cum_cost"] == 500000
    assert out["peak_timing_gap"] > 0
    assert all(r["timing_gap"] <= r["cash_gap_before_instalment"] for r in out["rungs"])


def test_ladder_caps_scheme_loan_at_70000():
    out = build_ladder(PACK, 500000, scheme_loan=200000)
    assert out["scheme_loan"] == 70000


def test_ladder_no_funding_gap_when_covered():
    out = build_ladder(PACK, 150000, own_savings=40000)
    assert out["funding_gap"] == 0


def test_emi_roundtrip():
    p = aff.max_principal(aff.emi(100000, 0.12, 36), 0.12, 36)
    assert p == pytest.approx(100000)


def test_affordability_counts_scheme_loan_and_caps_at_30_percent():
    income = [10000] * 12
    scheme = aff.Loan("PMAY-G", 70000, 0.07, 60)
    res = aff.assess(income, [scheme], requested=150000, rate_pa=0.12, months=60)
    assert res.cap_amount == pytest.approx(3000)
    total_emi = scheme.emi + aff.emi(res.approved_new_loan, 0.12, 60)
    assert total_emi <= 3000 + 1e-6
    without = aff.assess(income, [], requested=150000, rate_pa=0.12, months=60)
    assert res.max_new_loan < without.max_new_loan  # scheme loan reduces headroom


def test_affordability_no_loan_path_when_over_cap():
    res = aff.assess([5000] * 12, [aff.Loan("x", 100000, 0.1, 24)], 100000, 0.12, 36)
    assert res.approved_new_loan == 0 and res.no_loan_path


def test_conservative_income_weights_lean_months():
    inc = [2000] * 3 + [20000] * 9
    assert aff.conservative_income(inc) < sum(inc) / 12





def test_scheme_loan_rate_needs_a_lender_base_rate():
    assert PACK.effective_scheme_loan_rate(0.10) == pytest.approx(0.07)
    assert PACK.effective_scheme_loan_rate(0.02) == 0.0
    assert not hasattr(PACK, "scheme_loan_rate")  # no silent default


def test_ladder_reports_unverified_stage_split():
    out = build_ladder(PACK, 500000)
    assert out["assumptions"] and "ILLUSTRATIVE" in out["assumptions"][0]
