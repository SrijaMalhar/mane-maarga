"""Flight Recorder: every run is sealed, tampering is found at the exact step, and replay compares."""

from app.database import SessionLocal
from app.models import AgentRun, AgentStep, Case


def make_run(client, **extra):
    body = {"beneficiary_name": "Lakshmamma K", "village": "Hosahalli", "taluk": "Kunigal", "status": "planning"}
    cid = client.post("/api/cases", json={**body, **extra}).json()["id"]
    run = client.post(f"/api/cases/{cid}/agent/run", json={"provider": "mock"}).json()
    return cid, run


def test_a_finished_run_is_sealed_and_verifies(client):
    _, run = make_run(client, estimated_cost=300000, sanctioned_amount=120000)
    assert run["seal"] and all(len(s["seal"]) == 64 for s in run["steps"])
    assert len({s["seal"] for s in run["steps"]}) == len(run["steps"])
    rec = client.get(f"/api/agent/runs/{run['id']}/recording").json()
    assert rec["verification"] == {
        "state": "intact",
        "checked": len(run["steps"]),
        "of": len(run["steps"]),
        "broken_at": None,
        "seal": run["seal"],
    }
    assert rec["rule_pack"]["id"].startswith("KA-PMAYG")
    effects = {s["tool"]: s["side_effect"] for s in rec["steps"] if s["tool"]}
    assert effects["build_money_ladder"] == "none"


def test_editing_a_stored_step_breaks_the_seal_at_that_step(client):
    _, run = make_run(client, estimated_cost=300000, sanctioned_amount=120000)
    db = SessionLocal()
    step = db.query(AgentStep).filter_by(run_id=run["id"], tool="build_money_ladder").one()
    step.result_json = step.result_json.replace('"funding_gap": ', '"funding_gap": 1')
    idx = step.idx
    db.commit()
    db.close()
    v = client.get(f"/api/agent/runs/{run['id']}/recording").json()["verification"]
    assert v["state"] == "broken" and v["broken_at"] == idx and v["checked"] == idx - 1


def test_changing_the_outcome_breaks_the_seal(client):
    _, run = make_run(client, estimated_cost=300000, sanctioned_amount=120000)
    db = SessionLocal()
    db.get(AgentRun, run["id"]).message_en = "All good, nothing to do."
    db.commit()
    db.close()
    v = client.get(f"/api/agent/runs/{run['id']}/recording").json()["verification"]
    assert v["state"] == "broken" and v["broken_at"] == "outcome"


def test_replay_reproduces_reads_and_never_reruns_writes(client):
    _, run = make_run(client, estimated_cost=300000, sanctioned_amount=120000)
    rep = client.post(f"/api/agent/runs/{run['id']}/replay").json()
    assert rep["summary"]["differs"] == 0 and rep["summary"]["reran"] >= 3
    by_tool = {r["tool"]: r for r in rep["steps"] if r["tool"]}
    assert by_tool["build_money_ladder"]["outcome"] == "same"
    assert by_tool["draft_message"]["outcome"] in ("same", "not_rerun")
    assert all(r["outcome"] == "no_tool" for r in rep["steps"] if r["tool"] is None)


def test_replay_shows_what_changed_after_the_case_changed(client):
    cid, run = make_run(client, estimated_cost=300000, sanctioned_amount=120000)
    db = SessionLocal()
    db.get(Case, cid).estimated_cost = 420000
    db.commit()
    db.close()
    rep = client.post(f"/api/agent/runs/{run['id']}/replay").json()
    assert rep["summary"]["differs"] >= 1
    ladder = next(r for r in rep["steps"] if r["tool"] == "build_money_ladder")
    assert ladder["outcome"] == "differs" and any("gap" in c or "cost" in c for c in ladder["changed"])


def test_replay_does_not_write_tasks_again(client):
    cid, run = make_run(client)  # no estimate: the agent creates a recovery task
    from app.models import RecoveryTask

    db = SessionLocal()
    before = db.query(RecoveryTask).filter_by(case_id=cid).count()
    db.close()
    rep = client.post(f"/api/agent/runs/{run['id']}/replay").json()
    task = next(r for r in rep["steps"] if r["tool"] == "create_task")
    assert task["outcome"] == "not_rerun" and task["why"] == "changes data"
    db = SessionLocal()
    assert db.query(RecoveryTask).filter_by(case_id=cid).count() == before
    db.close()


def test_unknown_run_is_404(client):
    assert client.get("/api/agent/runs/99999/recording").status_code == 404
    assert client.post("/api/agent/runs/99999/replay").status_code == 404
