from fastapi.testclient import TestClient
from app.main import app


def test_ladder_requires_authentication():
    assert TestClient(app).post("/api/engine/ladder", json={"total_cost": 500000}).status_code == 401


def test_ladder_endpoint(client):
    r = client.post("/api/engine/ladder", json={"total_cost": 500000, "own_savings": 20000, "scheme_loan": 70000})
    assert r.status_code == 200
    body = r.json()
    assert body["funding_gap"] == 290000
    assert body["peak_timing_gap"] == 18000
    assert body["assumptions"] and "decision" in body["disclaimer"]


def test_ladder_validation_and_unknown_state(client):
    assert client.post("/api/engine/ladder", json={"total_cost": 0}).status_code == 422
    assert client.post("/api/engine/ladder", json={"state": "XX", "total_cost": 1000}).status_code == 404


def test_affordability_counts_existing_and_scheme_loan(client):
    payload = {"monthly_income": [10000] * 12,
               "existing_loans": [{"name": "PMAY-G scheme loan", "principal": 70000, "rate_pa": 0.07, "months": 60}],
               "requested": 150000, "rate_pa": 0.12, "months": 60}
    r = client.post("/api/engine/affordability", json=payload)
    assert r.status_code == 200
    body = r.json()
    assert body["cap_amount"] == 3000
    assert 0 < body["indicative_loan_within_cap"] < 150000 and body["no_loan_path"] is True
    assert "approved_new_loan" not in body


def test_affordability_rejects_oversized_input(client):
    bad = {"monthly_income": [1000] * 25, "requested": 1000, "rate_pa": 0.1, "months": 12}
    assert client.post("/api/engine/affordability", json=bad).status_code == 422
