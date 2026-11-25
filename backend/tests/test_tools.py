"""Tool layer: every tool works, every call is audited, and no tool changes status or money."""

import json

import pytest

from app.agents.tools import REGISTRY, ToolContext, ToolError, call_tool, tool_specs
from app.core import config
from app.database import SessionLocal
from app.models import ApprovalRequest, AuditLog, Case, CaseFundingSource, RecoveryTask

TOKEN = "t" * 40
P = "KA-PMAYG-2024-25"


@pytest.fixture
def case_id(client):
    r = client.post(
        "/api/cases",
        json={
            "beneficiary_name": "Lakshmamma K",
            "village": "Hosahalli",
            "taluk": "Kunigal",
            "phone_last4": "4321",
            "status": "planning",
            "estimated_cost": 300000,
            "sanctioned_amount": 120000,
        },
    )
    cid = r.json()["id"]
    body = {"source_type": "subsidy", "source_name": "PMAY-G", "amount": 120000, "status": "confirmed"}
    assert client.post(f"/api/cases/{cid}/funding", json=body).status_code == 201
    return cid


@pytest.fixture
def ctx(client):
    db = SessionLocal()
    yield ToolContext(db=db, actor="test-agent")
    db.close()


def run(ctx, name, **args):
    return call_tool(ctx, name, args)


def snapshot(db, cid):
    db.expire_all()
    c = db.get(Case, cid)
    money = sorted(
        (f.source_name, float(f.amount), f.status) for f in db.query(CaseFundingSource).filter_by(case_id=cid)
    )
    return (c.status, float(c.sanctioned_amount), float(c.estimated_cost), float(c.gap_amount), c.consent_status, money)


def test_registry_has_the_eleven_tools_with_schemas():
    assert set(REGISTRY) == {
        "get_case",
        "list_documents",
        "check_documents",
        "check_eligibility",
        "build_money_ladder",
        "assess_affordability",
        "plan_land_route",
        "create_task",
        "draft_message",
        "request_approval",
        "get_rule_clause",
    }
    for spec in tool_specs():
        assert spec["description"] and spec["input_schema"]["type"] == "object" and spec["output_schema"]
    assert {t.side_effect for t in REGISTRY.values()} == {"none", "write", "gated"}
    assert [n for n, t in REGISTRY.items() if t.side_effect == "gated"] == ["request_approval"]


def test_get_case_and_documents(ctx, case_id):
    c = run(ctx, "get_case", case_id=case_id)
    assert c["beneficiary_name"] == "Lakshmamma K" and c["confirmed_funding"] == 120000
    assert run(ctx, "list_documents", case_id=case_id)["documents"] == []
    check = run(ctx, "check_documents", case_id=case_id)
    assert check["status"] == "attention_required" and check["document_count"] == 0


def test_check_eligibility_tool_never_guesses(ctx, case_id):
    out = run(ctx, "check_eligibility", case_id=case_id, facts={"housing_condition": "kutcha"})
    assert out["verdict"] == "needs_information" and "kcc_limit" in out["missing_facts"]
    out = run(ctx, "check_eligibility", facts={"housing_condition": "kutcha", "kcc_limit": 60000})
    assert out["verdict"] == "not_eligible" and f"{P}:EX-01" in out["clause_ids"]


def test_money_ladder_and_affordability(ctx, case_id):
    lad = run(ctx, "build_money_ladder", case_id=case_id, own_savings=20000, scheme_loan=70000)
    assert lad["funding_gap"] == 300000 - (20000 + 70000 + 120000)
    assert lad["stages_verified"] is False and lad["assumptions"]
    assert f"{P}:AM-01" in lad["citations"]
    a = run(
        ctx, "assess_affordability", monthly_income=[9000, 10000, 12000, 6000], requested=70000, rate_pa=0.09, months=60
    )
    assert a["approved_new_loan"] <= 70000 and a["cap_amount"] == pytest.approx(0.3 * (6000 + 9000 + 10000) / 3)


def test_ladder_without_cost_is_a_recoverable_error(ctx, client):
    cid = client.post("/api/cases", json={"beneficiary_name": "No Estimate", "village": "V", "taluk": "T"}).json()["id"]
    with pytest.raises(ToolError) as e:
        run(ctx, "build_money_ladder", case_id=cid)
    assert e.value.code == "missing_cost_estimate"


def test_land_route_stub(ctx, case_id):
    assert run(ctx, "plan_land_route", case_id=case_id)["status"] == "needs_information"
    assert run(ctx, "plan_land_route", case_id=case_id, has_own_land=True)["status"] == "not_needed"
    assert run(ctx, "plan_land_route", case_id=case_id, has_own_land=False)["status"] == "not_available"


def test_create_task_and_draft_message(ctx, case_id):
    t = run(ctx, "create_task", case_id=case_id, title="Collect RTC extract", category="document")
    assert t["status"] == "open" and ctx.db.get(RecoveryTask, t["task_id"]).created_by == "test-agent"
    kn = run(ctx, "draft_message", case_id=case_id, kind="document_request", items="RTC", language="kn")
    en = run(ctx, "draft_message", case_id=case_id, kind="document_request", items="RTC", language="en")
    assert kn["text"].startswith("ನಮಸ್ಕಾರ Lakshmamma") and "RTC" in en["text"] and not kn["sent"]


def test_get_rule_clause(ctx):
    c = run(ctx, "get_rule_clause", clause_id=f"{P}:AM-02")
    assert c["value"] == 70000 and c["text_kn"] and c["source"]["url"].startswith("https://")
    with pytest.raises(ToolError) as e:
        run(ctx, "get_rule_clause", clause_id=f"{P}:AM-99")
    assert e.value.code == "clause_not_found"


def test_bad_arguments_and_unknown_tools_are_refused(ctx, case_id):
    for name, args, code in [
        ("nope", {}, "unknown_tool"),
        ("get_case", {"case_id": "x"}, "invalid_arguments"),
        ("get_case", {"case_id": 99999}, "case_not_found"),
        (
            "request_approval",
            {"case_id": case_id, "action": "case_status_change", "reason": "stage done"},
            "invalid_arguments",
        ),
    ]:
        with pytest.raises(ToolError) as e:
            call_tool(ctx, name, args)
        assert e.value.code == code


def test_every_call_writes_an_audit_row_with_hashes(ctx, case_id):
    before = ctx.db.query(AuditLog).filter(AuditLog.action.like("tool:%")).count()
    run(ctx, "get_case", case_id=case_id)
    with pytest.raises(ToolError):
        run(ctx, "get_case", case_id=99999)
    rows = ctx.db.query(AuditLog).filter(AuditLog.action.like("tool:%")).order_by(AuditLog.id).all()[before:]
    ok, err = (json.loads(r.detail) for r in rows)
    assert ok["status"] == "ok" and len(ok["args_sha"]) == 16 and ok["result_sha"] and ok["ms"] >= 0
    assert err["status"] == "error" and err["result_sha"] is None
    assert rows[0].actor == "test-agent"


def test_no_tool_changes_status_or_money(ctx, case_id):
    """Call every write and gated tool, including approval requests for status, money and payments."""
    before = snapshot(ctx.db, case_id)
    run(ctx, "create_task", case_id=case_id, title="Visit site")
    for action, extra in [
        ("case_status_change", {"new_status": "completed"}),
        ("financial_offer", {"amount": 70000}),
        ("payment", {"amount": 120000}),
        ("submission", {}),
    ]:
        out = run(ctx, "request_approval", case_id=case_id, action=action, reason="Proposed by the agent", **extra)
        assert out["status"] == "pending"
    for name in REGISTRY:
        if REGISTRY[name].side_effect == "none" and name not in (
            "get_rule_clause",
            "assess_affordability",
            "check_eligibility",
        ):
            run(
                ctx,
                name,
                case_id=case_id,
                **({"kind": "cash_needed", "items": "Rs 40,000"} if name == "draft_message" else {}),
            )
    assert snapshot(ctx.db, case_id) == before
    assert ctx.db.query(ApprovalRequest).filter_by(case_id=case_id, status="pending").count() == 4


def test_only_an_admin_decision_changes_status(client, ctx, case_id):
    out = run(
        ctx,
        "request_approval",
        case_id=case_id,
        action="case_status_change",
        new_status="finance_review",
        reason="Documents verified",
        citations=[f"{P}:EL-01"],
    )
    assert client.get(f"/api/cases/{case_id}").json()["status"] == "planning"
    listed = client.get(f"/api/cases/{case_id}/approvals").json()
    assert listed[0]["citations"] == [f"{P}:EL-01"] and listed[0]["status"] == "pending"
    d = client.post(f"/api/approvals/{out['approval_id']}/decide", json={"approve": True, "note": "Checked"})
    assert d.status_code == 200 and d.json()["decided_by"] == "testadmin"
    assert client.get(f"/api/cases/{case_id}").json()["status"] == "finance_review"
    assert client.post(f"/api/approvals/{out['approval_id']}/decide", json={"approve": False}).status_code == 409


def test_tool_http_endpoints_need_the_service_token(client, case_id, monkeypatch):
    assert client.get("/api/tools/openapi.json").status_code == 503
    monkeypatch.setattr(config, "SERVICE_TOKEN", TOKEN)
    assert client.get("/api/tools/openapi.json", headers={"X-Service-Token": "wrong"}).status_code == 401
    h = {"X-Service-Token": TOKEN}
    spec = client.get("/api/tools/openapi.json", headers=h).json()
    assert len(spec["tools"]) == 11
    r = client.post("/api/tools/get_case", json={"case_id": case_id}, headers=h)
    assert r.status_code == 200 and r.json()["result"]["village"] == "Hosahalli"
    assert client.post("/api/tools/get_case", json={"case_id": 99999}, headers=h).status_code == 404
    assert client.post("/api/tools/get_case", json={"case_id": "x"}, headers=h).status_code == 422
    assert client.post("/api/tools/nope", json={}, headers=h).status_code == 404
