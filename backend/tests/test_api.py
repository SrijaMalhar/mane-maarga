import pytest
pytest.importorskip("fastapi")
pytest.importorskip("httpx")
from fastapi.testclient import TestClient
from sooru.api import app

client = TestClient(app)


def test_health():
    assert client.get("/health").json() == {"status": "ok"}


def test_ladder_endpoint():
    r = client.post("/ladder", json={"total_cost": 500000, "own_savings": 20000, "scheme_loan": 70000})
    assert r.status_code == 200 and r.json()["funding_gap"] == 290000


def test_unknown_state_404():
    assert client.post("/ladder", json={"state": "XX", "total_cost": 1}).status_code == 404
