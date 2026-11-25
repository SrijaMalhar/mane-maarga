"""The rule-based case checks: blockers from every check reach recovery, and no subsidy is counted twice."""

from types import SimpleNamespace as NS

from app.agents import run_case_agents


def case(**kw):
    base = {
        "id": 1,
        "beneficiary_name": "Sample",
        "village": "Kudur",
        "taluk": "Magadi",
        "status": "intake",
        "estimated_cost": 0,
        "sanctioned_amount": 0,
        "existing_loan": 0,
        "consent_status": "given",
    }
    return NS(**{**base, **kw})


def recovery(plan):
    return next(s for s in plan["case_manager"]["specialists"] if s["agent"] == "recovery_agent")


def test_empty_case_reports_every_blocker_in_recovery():
    plan = run_case_agents(case(), [], [], [], [])
    blockers = recovery(plan)["findings"]["blockers"]
    assert {"no documents", "no cost estimate", "no construction stages"} <= set(blockers)
    assert recovery(plan)["status"] == "attention_required"


def test_sanctioned_amount_and_confirmed_subsidy_are_not_double_counted():
    subsidy = NS(amount=120000, status="confirmed")
    plan = run_case_agents(case(estimated_cost=300000, sanctioned_amount=120000), [], [], [subsidy], [])
    finance = next(s for s in plan["case_manager"]["specialists"] if s["agent"] == "finance_agent")
    assert finance["findings"]["estimated_gap"] == 180000
