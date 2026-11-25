import os
TEST_DATABASE_URL = "sqlite:///./mane_maarga_test.db"
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["MANE_MAARGA_JWT_SECRET"] = "test-secret-key-that-is-long-enough-for-test"
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.database import Base, engine

@pytest.fixture
def client(tmp_path, monkeypatch):
    from app import main
    from app.core import config
    config.UPLOAD_DIR = tmp_path / "uploads"
    main._auth_attempts.clear()  # isolate in-memory throttling between tests
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with TestClient(app) as test_client:
        boot = test_client.post("/api/auth/bootstrap", json={"username":"testadmin","email":"admin@example.test","password":"Secure-test-password-123"})
        assert boot.status_code == 201
        test_client.headers.update({"Authorization": f"Bearer {boot.json()['access_token']}"})
        yield test_client
    Base.metadata.drop_all(bind=engine)
