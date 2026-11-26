"""Agent runtime: happy path, recovery from a tool error, a blocked invented figure, Lyzr retries."""

import json

import pytest

from app.agents.guards.citation_guard import check
from app.agents.providers import Decision, LyzrProvider, ProviderError, Turn
from app.agents.providers.lyzr import parse_decision
from app.agents.runtime import MAX_STEPS, run_agent
from app.database import SessionLocal
from app.engine.rules import load_pack
from app.lib_money import format_inr
from app.models import ApprovalRequest, Case, RecoveryTask

P = "KA-PMAYG-2024-25"


def make_case(client, **extra):
    body = {
        "beneficiary_name": "Lakshmamma K",
        "village": "Hosahalli",
        "taluk": "Kunigal",
        "status": "planning",
        **extra,
    }
    return client.post("/api/cases", json=body).json()["id"]


def phases(run):
    return [s["phase"] for s in run["steps"]]


def test_happy_path_every_figure_comes_from_a_tool(client):
    cid = make_case(client, estimated_cost=300000, sanctioned_amount=120000)
    r = client.post(f"/api/cases/{cid}/agent/run", json={"provider": "mock"})
    assert r.status_code == 201
    run = r.json()
    assert run["status"] == "done"
    assert phases(run) == ["PLAN", "ACT", "ACT", "ACT", "ACT", "CHECK", "DONE"]
    ladder = next(s for s in run["steps"] if s["tool"] == "build_money_ladder")["result"]
    assert format_inr(ladder["peak_cash_before_instalment"]) in run["message_en"]
    assert format_inr(ladder["funding_gap"]) in run["message_kn"]
    assert run["message_kn"] and run["citations"] == [f"{P}:AM-01"]
    draft = next(s for s in run["steps"] if s["tool"] == "draft_message")["result"]
    assert draft["language"] == "kn" and draft["sent"] is False
    assert client.get(f"/api/cases/{cid}").json()["status"] == "planning"
    assert client.get(f"/api/cases/{cid}/agent/runs").json()[0]["id"] == run["id"]


def test_recovery_after_a_tool_error_creates_a_task_and_asks(client):
    cid = make_case(client)  # no cost estimate
    run = client.post(f"/api/cases/{cid}/agent/run", json={"provider": "mock"}).json()
    assert run["status"] == "asked"
    assert phases(run) == ["PLAN", "ACT", "ACT", "ACT", "RECOVER", "CHECK", "ASK"]
    failed = run["steps"][3]
    assert failed["tool"] == "build_money_ladder" and failed["error"] == "missing_cost_estimate"
    assert run["steps"][4]["tool"] == "create_task"
    db = SessionLocal()
    assert db.query(RecoveryTask).filter_by(case_id=cid, title="Record a construction cost estimate").count() == 1
    db.close()


def test_invented_figure_and_clause_are_blocked(client):
    cid = make_case(client, estimated_cost=300000)
    run = client.post(f"/api/cases/{cid}/agent/run", json={"provider": "mock", "script": "invented_figure"}).json()
    assert run["status"] == "blocked"
    assert "2,00,000" not in run["message_en"] and run["message_en"].startswith("Withheld")
    checks = [s for s in run["steps"] if s["phase"] == "CHECK"]
    assert len(checks) == 2 and all(s["error"] == "citation_guard" for s in checks)
    assert any("AM-77" in p for p in checks[0]["result"]["problems"])
    assert any("200000" in p for p in checks[1]["result"]["problems"])


def test_guard_rules():
    pack = load_pack("KA")
    assert check("Unit assistance is ₹1,20,000.", "₹1,20,000", [f"{P}:AM-01"], [], pack).ok
    assert not check("Unit assistance is ₹1,20,000.", "₹1,20,000", [], [], pack).ok  # uncited, no tool
    assert check("Gap ₹40,500.", "₹40,500", [], [{"funding_gap": 40500.0}], pack).ok
    assert not check("Gap ₹40,500.", "", [], [{"funding_gap": 40500.0}], pack).ok  # Kannada missing
    g = check("Excluded above 5 acres.", "5 ಎಕರೆ", [f"{P}:EX-08"], [], pack)
    assert g.ok and g.unverified_citations == [f"{P}:EX-08"]


class Looping:
    name = "loop"

    def decide(self, turn):
        return Decision(thought_summary="again", status="continue")


class Grabby:
    """A model that tries to approve its own request and call a tool that does not exist."""

    name = "grabby"

    def __init__(self):
        self.n = 0

    def decide(self, turn):
        self.n += 1
        if self.n == 1:
            return Decision.model_validate(
                {"action": {"tool": "set_case_status", "args": {"case_id": turn.case_id, "status": "completed"}}}
            )
        if self.n == 2:
            return Decision.model_validate(
                {
                    "action": {
                        "tool": "request_approval",
                        "args": {
                            "case_id": turn.case_id,
                            "action": "change_case_status",
                            "payload": {"new_status": "completed"},
                            "reason": "All done",
                        },
                    }
                }
            )
        return Decision(status="done", message_en="Requested approval.", message_kn="ಅನುಮೋದನೆ ಕೇಳಲಾಗಿದೆ.")


def test_step_limit_and_no_self_approval(client):
    cid = make_case(client, estimated_cost=300000)
    db = SessionLocal()
    assert run_agent(db, cid, "tester", Looping()).status == "step_limit"
    run = run_agent(db, cid, "tester", Grabby())
    assert run.status == "done"
    db.expire_all()
    assert db.get(Case, cid).status == "planning"
    assert db.query(ApprovalRequest).filter_by(case_id=cid, status="pending").count() == 1
    db.close()
    assert MAX_STEPS == 12


def test_lyzr_provider_retries_then_parses():
    calls = []

    def flaky(url, headers, body, timeout):
        calls.append((url, headers["x-api-key"], body))
        if len(calls) < 3:
            raise OSError("connection reset")
        return {
            "response": '```json\n{"thought_summary": "ok", "action": {"tool": "get_case", "args": {"case_id": 1}}}\n```'
        }

    p = LyzrProvider(api_key="k", agent_id="a", post=flaky, backoff=0)
    turn = Turn(case_id=1, goal="g", language="en", system_prompt="s", tools=[])
    d = p.decide(turn)
    assert d.action.tool == "get_case" and len(calls) == 3
    url, key, body = calls[0]
    assert url.startswith("https://agent-prod.studio.lyzr.ai/") and key == "k"
    assert set(body) == {"user_id", "agent_id", "session_id", "message"} and json.loads(body["message"])["case_id"] == 1

    def down(*a):
        raise OSError("down")

    with pytest.raises(ProviderError):
        LyzrProvider(api_key="k", agent_id="a", post=down, backoff=0).decide(turn)
    with pytest.raises(ProviderError):
        parse_decision("I think the family is eligible.")


def test_unconfigured_lyzr_is_a_clear_400(client):
    cid = make_case(client)
    r = client.post(f"/api/cases/{cid}/agent/run", json={"provider": "lyzr"})
    assert r.status_code == 400 and "LYZR" in r.json()["detail"]
