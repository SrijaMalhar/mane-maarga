from app.api import auth as auth_api
from app.api import documents as documents_api


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_create_case_calculates_gap_without_subtracting_existing_loan(client):
    response = client.post(
        "/api/cases",
        json={
            "beneficiary_name": "Test Beneficiary",
            "village": "Test Village",
            "taluk": "Test Taluk",
            "phone_last4": "1234",
            "status": "intake",
            "estimated_cost": 800000,
            "sanctioned_amount": 200000,
            "existing_loan": 100000,
        },
    )
    assert response.status_code == 201
    case = response.json()
    assert case["gap_amount"] == 600000
    assert case["existing_loan"] == 100000


def test_update_recalculates_gap(client):
    created = client.post(
        "/api/cases",
        json={
            "beneficiary_name": "Test Beneficiary",
            "village": "Test Village",
            "taluk": "Test Taluk",
            "estimated_cost": 800000,
            "sanctioned_amount": 200000,
        },
    )
    case_id = created.json()["id"]
    updated = client.patch(f"/api/cases/{case_id}", json={"estimated_cost": 1000000})
    assert updated.status_code == 200
    assert updated.json()["gap_amount"] == 800000


def test_consent_record_and_withdrawal_history(client):
    created = client.post(
        "/api/cases",
        json={
            "beneficiary_name": "Test Beneficiary",
            "village": "Test Village",
            "taluk": "Test Taluk",
        },
    )
    case_id = created.json()["id"]
    given = client.post(
        f"/api/cases/{case_id}/consent",
        json={
            "consent_given": True,
            "consent_scope": "case_processing",
            "consent_text_version": "v1",
        },
    )
    withdrawn = client.post(
        f"/api/cases/{case_id}/consent",
        json={
            "consent_given": False,
            "consent_scope": "case_processing",
            "consent_text_version": "v1",
        },
    )
    history = client.get(f"/api/cases/{case_id}/consent")
    case = client.get(f"/api/cases/{case_id}")
    assert given.status_code == 201
    assert withdrawn.status_code == 201
    assert len(history.json()) == 2
    assert case.json()["consent_status"] == "withdrawn"


def test_audit_and_delete(client):
    created = client.post(
        "/api/cases",
        json={
            "beneficiary_name": "Test Beneficiary",
            "village": "Test Village",
            "taluk": "Test Taluk",
        },
    )
    case_id = created.json()["id"]
    audit = client.get("/api/audit", params={"case_id": case_id})
    assert audit.status_code == 200
    assert any(item["action"] == "case_created" for item in audit.json())
    deleted = client.delete(f"/api/cases/{case_id}")
    assert deleted.status_code == 204
    assert client.get(f"/api/cases/{case_id}").status_code == 404
    # Deletion audit event is retained even after the case is deleted.
    audit_after = client.get("/api/audit")
    assert any(item["action"] == "case_deleted" for item in audit_after.json())


def test_gap_never_negative(client):
    response = client.post(
        "/api/cases",
        json={
            "beneficiary_name": "Test Beneficiary",
            "village": "Test Village",
            "taluk": "Test Taluk",
            "estimated_cost": 100000,
            "sanctioned_amount": 200000,
        },
    )
    assert response.status_code == 201
    assert response.json()["gap_amount"] == 0


def test_negative_amount_rejected(client):
    response = client.post(
        "/api/cases",
        json={
            "beneficiary_name": "Test Beneficiary",
            "village": "Test Village",
            "taluk": "Test Taluk",
            "estimated_cost": -1,
        },
    )
    assert response.status_code == 422


def test_missing_case_returns_404(client):
    assert client.get("/api/cases/99999").status_code == 404
    assert client.get("/api/cases/99999/consent").status_code == 404
    assert (
        client.post(
            "/api/cases/99999/consent",
            json={
                "consent_given": True,
            },
        ).status_code
        == 404
    )


def test_existing_database_migration_adds_consent_status(tmp_path):
    from sqlalchemy import create_engine, inspect, text

    from app.main import ensure_consent_status_column

    legacy_engine = create_engine(f"sqlite:///{tmp_path / 'legacy.db'}")
    with legacy_engine.begin() as conn:
        conn.execute(text("CREATE TABLE cases (id INTEGER PRIMARY KEY)"))
    ensure_consent_status_column(legacy_engine)
    columns = {column["name"] for column in inspect(legacy_engine).get_columns("cases")}
    assert "consent_status" in columns
    # Running the migration again is safe and idempotent.
    ensure_consent_status_column(legacy_engine)
    legacy_engine.dispose()


def test_authentication_required(client):
    token = client.headers.pop("Authorization")
    try:
        assert client.get("/api/cases").status_code == 401
    finally:
        client.headers["Authorization"] = token


def test_bootstrap_only_once(client):
    response = client.post(
        "/api/auth/bootstrap",
        json={"username": "another", "email": "another@example.test", "password": "Another-secure-password-123"},
    )
    assert response.status_code == 409


def test_admin_can_create_operator_and_operator_cannot_read_audit(client):
    created = client.post(
        "/api/auth/users",
        json={
            "username": "operator1",
            "email": "operator@example.test",
            "password": "Operator-secure-password-123",
            "role": "operator",
        },
    )
    assert created.status_code == 201
    token = client.post(
        "/api/auth/login", json={"username": "operator1", "password": "Operator-secure-password-123"}
    ).json()["access_token"]
    old = client.headers["Authorization"]
    client.headers["Authorization"] = f"Bearer {token}"
    assert client.get("/api/cases").status_code == 200
    assert client.get("/api/audit").status_code == 403
    assert client.delete("/api/cases/999").status_code == 403
    client.headers["Authorization"] = old


def test_document_upload_download_and_verification(client):
    created = client.post(
        "/api/cases", json={"beneficiary_name": "Test Beneficiary", "village": "Test Village", "taluk": "Test Taluk"}
    )
    case_id = created.json()["id"]
    payload = b"%PDF-1.4\nTest PDF file\n%%EOF"
    upload = client.post(f"/api/cases/{case_id}/documents", files={"file": ("proof.pdf", payload, "application/pdf")})
    assert upload.status_code == 201
    document_id = upload.json()["id"]
    assert client.get(f"/api/cases/{case_id}/documents").json()[0]["verification_status"] == "pending"
    verified = client.patch(f"/api/documents/{document_id}/verification", params={"status": "verified"})
    assert verified.status_code == 200 and verified.json()["verification_status"] == "verified"
    download = client.get(f"/api/documents/{document_id}/download")
    assert download.status_code == 200 and download.content == payload


def test_upload_rejects_wrong_content_and_unsupported_extension(client):
    created = client.post(
        "/api/cases", json={"beneficiary_name": "Test Beneficiary", "village": "Test Village", "taluk": "Test Taluk"}
    )
    case_id = created.json()["id"]
    bad = client.post(f"/api/cases/{case_id}/documents", files={"file": ("fake.pdf", b"not pdf", "application/pdf")})
    unsupported = client.post(
        f"/api/cases/{case_id}/documents", files={"file": ("script.exe", b"MZ", "application/octet-stream")}
    )
    assert bad.status_code == 415
    assert unsupported.status_code == 415


def test_funding_sources_and_summary_separate_proposed_confirmed_received(client):
    created = client.post(
        "/api/cases",
        json={
            "beneficiary_name": "Test Beneficiary",
            "village": "Test Village",
            "taluk": "Test Taluk",
            "estimated_cost": 500000,
            "sanctioned_amount": 100000,
            "existing_loan": 50000,
        },
    )
    case_id = created.json()["id"]
    proposed = client.post(
        f"/api/cases/{case_id}/funding",
        json={"source_type": "loan", "source_name": "Co-op loan", "amount": 100000, "status": "proposed"},
    )
    received = client.post(
        f"/api/cases/{case_id}/funding",
        json={
            "source_type": "subsidy",
            "source_name": "Verified subsidy instalment",
            "amount": 50000,
            "status": "received",
            "scheme_code": "PMAY_G",
            "reference_number": "REF-1",
        },
    )
    assert proposed.status_code == 201 and received.status_code == 201
    summary = client.get(f"/api/cases/{case_id}/finance-summary").json()
    assert summary["funding_proposed"] == 100000
    assert summary["funding_received"] == 50000
    assert summary["funding_confirmed"] == 50000
    assert summary["funding_gap"] == 450000
    assert summary["existing_loans"] == 50000


def test_duplicate_confirmed_scheme_reference_rejected(client):
    case_id = client.post(
        "/api/cases", json={"beneficiary_name": "Test Beneficiary", "village": "Test Village", "taluk": "Test Taluk"}
    ).json()["id"]
    body = {
        "source_type": "subsidy",
        "source_name": "Scheme assistance",
        "amount": 10000,
        "status": "confirmed",
        "scheme_code": "PMAY_G",
        "reference_number": "R-001",
    }
    assert client.post(f"/api/cases/{case_id}/funding", json=body).status_code == 201
    assert client.post(f"/api/cases/{case_id}/funding", json=body).status_code == 409


def test_construction_stage_timing_shortfall(client):
    case_id = client.post(
        "/api/cases",
        json={
            "beneficiary_name": "Test Beneficiary",
            "village": "Test Village",
            "taluk": "Test Taluk",
            "estimated_cost": 500000,
        },
    ).json()["id"]
    stage1 = client.post(
        f"/api/cases/{case_id}/stages",
        json={"stage_code": "foundation", "stage_name": "Foundation", "planned_cost": 120000},
    )
    stage2 = client.post(
        f"/api/cases/{case_id}/stages", json={"stage_code": "walls", "stage_name": "Walls", "planned_cost": 180000}
    )
    assert stage1.status_code == 201 and stage2.status_code == 201
    summary = client.get(f"/api/cases/{case_id}/finance-summary").json()
    assert summary["stages"][0]["cash_shortfall_before_stage"] == 120000
    assert summary["stages"][1]["cash_shortfall_before_stage"] == 300000
    updated = client.patch(f"/api/stages/{stage1.json()['id']}/status", json={"status": "verified"})
    assert updated.status_code == 200 and updated.json()["status"] == "verified"


def test_scheme_catalog_does_not_claim_eligibility(client):
    result = client.get("/api/schemes").json()
    assert result["disclaimer"]
    assert all(item["status"] == "reference_only" for item in result["schemes"])


def test_funding_evidence_document_must_belong_to_case(client):
    first = client.post(
        "/api/cases", json={"beneficiary_name": "First Beneficiary", "village": "V1", "taluk": "T1"}
    ).json()["id"]
    second = client.post(
        "/api/cases", json={"beneficiary_name": "Second Beneficiary", "village": "V2", "taluk": "T2"}
    ).json()["id"]
    upload = client.post(
        f"/api/cases/{first}/documents", files={"file": ("proof.pdf", b"%PDF-1.4\nproof\n%%EOF", "application/pdf")}
    )
    body = {"source_type": "grant", "source_name": "Grant", "amount": 1000, "evidence_document_id": upload.json()["id"]}
    assert client.post(f"/api/cases/{second}/funding", json=body).status_code == 422


def test_document_extraction_detects_case_mismatch(client, monkeypatch):
    monkeypatch.setattr(
        documents_api,
        "extract_document",
        lambda path, content_type: (
            "Applicant: Other Person\nVillage: Other Village\nSurvey No: 42/1\nExtent: 1 acre",
            "test-fixture",
            0.8,
        ),
    )
    case_id = client.post(
        "/api/cases", json={"beneficiary_name": "Test Beneficiary", "village": "Test Village", "taluk": "Test Taluk"}
    ).json()["id"]
    uploaded = client.post(
        f"/api/cases/{case_id}/documents", files={"file": ("land.pdf", b"%PDF-1.4\nfixture\n%%EOF", "application/pdf")}
    )
    document_id = uploaded.json()["id"]
    result = client.post(f"/api/documents/{document_id}/extract", json={"force": True})
    assert result.status_code == 200
    data = result.json()
    assert data["extraction_status"] == "review_required"
    assert data["extracted_fields"]["survey_number"] == "42/1"
    assert any(item["field"] == "beneficiary_name" and item["status"] == "mismatch" for item in data["checks"])
    assert client.get(f"/api/documents/{document_id}/extraction").json()["document_type"] == "land_record"


def test_extraction_is_persisted_and_force_reprocesses(client, monkeypatch):
    calls = []
    monkeypatch.setattr(
        documents_api,
        "extract_document",
        lambda path, content_type: (calls.append(1) or "Survey No: 10", "test-fixture", 0.7),
    )
    case_id = client.post(
        "/api/cases", json={"beneficiary_name": "Test Beneficiary", "village": "Test Village", "taluk": "Test Taluk"}
    ).json()["id"]
    doc_id = client.post(
        f"/api/cases/{case_id}/documents", files={"file": ("land.pdf", b"%PDF-1.4\nfixture\n%%EOF", "application/pdf")}
    ).json()["id"]
    first = client.post(f"/api/documents/{doc_id}/extract", json={"force": True})
    second = client.post(f"/api/documents/{doc_id}/extract", json={"force": False})
    assert first.status_code == second.status_code == 200
    assert len(calls) == 1
    third = client.post(f"/api/documents/{doc_id}/extract", json={"force": True})
    assert third.status_code == 200 and len(calls) == 2


def test_extraction_missing_document_and_ocr_unavailable(client, monkeypatch):
    assert client.post("/api/documents/999/extract", json={"force": True}).status_code == 404
    monkeypatch.setattr(
        documents_api,
        "extract_document",
        lambda path, content_type: (_ for _ in ()).throw(RuntimeError("OCR engine is unavailable")),
    )
    case_id = client.post(
        "/api/cases", json={"beneficiary_name": "Test Beneficiary", "village": "Test Village", "taluk": "Test Taluk"}
    ).json()["id"]
    doc_id = client.post(
        f"/api/cases/{case_id}/documents", files={"file": ("land.pdf", b"%PDF-1.4\nfixture\n%%EOF", "application/pdf")}
    ).json()["id"]
    response = client.post(f"/api/documents/{doc_id}/extract", json={"force": True})
    assert response.status_code == 422 and "OCR engine" in response.json()["detail"]


def test_agent_plan_returns_specialists_and_human_gate(client):
    created = client.post(
        "/api/cases",
        json={
            "beneficiary_name": "Agent Demo",
            "village": "Demo Village",
            "taluk": "Demo Taluk",
            "estimated_cost": 500000,
            "sanctioned_amount": 120000,
        },
    )
    assert created.status_code == 201
    case_id = created.json()["id"]
    response = client.get(f"/api/cases/{case_id}/agent-plan")
    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "deterministic_prototype"
    assert body["approval_gate"]["approved"] is False
    names = [agent["agent"] for agent in body["case_manager"]["specialists"]]
    assert names == ["document_agent", "finance_agent", "construction_agent", "recovery_agent"]
    assert body["case_manager"]["priority_actions"]
    finance = next(a for a in body["case_manager"]["specialists"] if a["agent"] == "finance_agent")
    assert finance["findings"]["estimated_gap"] == 380000


def test_agent_plan_not_found(client):
    response = client.get("/api/cases/999999/agent-plan")
    assert response.status_code == 404


def test_phase8_scheme_catalog_is_reference_only(client):
    response = client.get("/api/intelligence/schemes")
    assert response.status_code == 200
    data = response.json()
    assert data["count"] >= 4
    assert "eligibility" in data["disclaimer"].lower()
    assert all(item["reference_only"] for item in data["items"])


def test_phase8_voice_intake_session_flow(client):
    start = client.post("/api/intelligence/intake", json={"language": "en"})
    assert start.status_code == 201
    token = start.json()["session_token"]
    answers = ["Test Person", "Test Village", "Test Taluk", "yes", "4", "budget", "skip"]
    for answer in answers:
        response = client.post(f"/api/intelligence/intake/{token}/message", json={"message": answer})
        assert response.status_code == 200
    final = client.get(f"/api/intelligence/intake/{token}")
    assert final.status_code == 200
    assert final.json()["status"] == "completed"
    assert final.json()["fields"]["beneficiary_name"] == "Test Person"


def test_phase8_budget_plan_excludes_proposed_funding(client):
    created = client.post(
        "/api/cases", json={"beneficiary_name": "Budget Test", "village": "V", "taluk": "T", "estimated_cost": 100000}
    )
    case_id = created.json()["id"]
    client.post(
        f"/api/cases/{case_id}/funding",
        json={"source_type": "subsidy", "source_name": "Demo", "amount": 50000, "status": "proposed"},
    )
    response = client.post(
        f"/api/cases/{case_id}/budget-plan",
        json={
            "built_up_sqft": 500,
            "quality_tier": "basic",
            "contingency_percent": 8,
            "labor_percent": 35,
            "materials_percent": 55,
            "other_percent": 10,
        },
    )
    assert response.status_code == 200
    result = response.json()
    assert result["proposed_funding_not_counted"] == 50000
    assert result["confirmed_funding"] == 0
    assert result["funding_gap"] == result["estimated_total"]


def test_phase8_recovery_task_create_and_update(client):
    created = client.post("/api/cases", json={"beneficiary_name": "Task Test", "village": "V", "taluk": "T"})
    case_id = created.json()["id"]
    task = client.post(
        f"/api/cases/{case_id}/recovery-tasks", json={"title": "Get land record", "category": "document"}
    )
    assert task.status_code == 201
    updated = client.patch(f"/api/recovery-tasks/{task.json()['id']}", json={"status": "completed"})
    assert updated.status_code == 200
    assert updated.json()["status"] == "completed"


def test_phase8_synthetic_safety_suite(client):
    result = client.post("/api/intelligence/evaluation/synthetic")
    assert result.status_code == 200
    assert result.json()["failed"] == 0
    assert result.json()["passed"] == 5


def test_readiness_endpoint(client):
    response = client.get("/ready")
    assert response.status_code == 200
    assert response.json()["status"] == "ready"
    assert response.json()["database"] == "connected"


def test_security_headers_and_request_id(client):
    response = client.get("/health", headers={"X-Request-ID": "test-request-123"})
    assert response.headers["X-Request-ID"] == "test-request-123"
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["Referrer-Policy"] == "no-referrer"


def test_upload_rejects_mismatched_content_type(client):
    case = client.post(
        "/api/cases", json={"beneficiary_name": "Test Person", "village": "Test Village", "taluk": "Test Taluk"}
    )
    assert case.status_code == 201
    response = client.post(
        f"/api/cases/{case.json()['id']}/documents", files={"file": ("fake.pdf", b"%PDF-1.4 fake", "image/png")}
    )
    assert response.status_code == 415


def test_ready_reports_database_connection(client):
    response = client.get("/ready")
    assert response.status_code == 200
    assert response.json()["database"] == "connected"


def test_security_headers_and_request_id_variant(client):
    response = client.get("/health", headers={"X-Request-ID": "test-request-42"})
    assert response.status_code == 200
    assert response.headers["X-Request-ID"] == "test-request-42"
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["Referrer-Policy"] == "no-referrer"
    assert "frame-ancestors 'none'" in response.headers["Content-Security-Policy"]


def test_invalid_request_id_is_replaced(client):
    response = client.get("/health", headers={"X-Request-ID": "bad id with spaces"})
    assert response.status_code == 200
    assert response.headers["X-Request-ID"] != "bad id with spaces"


def test_system_version_and_metrics(client):
    version = client.get("/api/system/version")
    assert version.status_code == 200
    assert version.json()["version"] == "1.0.0"
    metrics = client.get("/metrics")
    assert metrics.status_code == 200
    assert "mane_maarga_http_requests_total" in metrics.text


def test_auth_cache_headers_are_no_store(client):
    response = client.get("/api/auth/me")
    assert response.status_code == 200
    assert response.headers["Cache-Control"] == "no-store"


def test_bootstrap_disabled_returns_forbidden(client, monkeypatch):
    monkeypatch.setattr(auth_api, "BOOTSTRAP_ENABLED", False)
    response = client.post(
        "/api/auth/bootstrap",
        json={
            "username": "blockedadmin",
            "email": "blocked@example.test",
            "password": "Another-secure-password-123",
        },
    )
    assert response.status_code == 403


def test_auth_rate_limit_returns_retry_after(monkeypatch):
    from fastapi import HTTPException
    from starlette.requests import Request

    from app import main

    main._auth_attempts.clear()
    request = Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/auth/login",
            "headers": [],
            "client": ("192.0.2.55", 1234),
            "server": ("testserver", 80),
            "scheme": "http",
            "query_string": b"",
        }
    )
    main.enforce_auth_rate_limit(request, "unit-test", 1, 60)
    try:
        main.enforce_auth_rate_limit(request, "unit-test", 1, 60)
        assert False, "Expected rate limit exception"
    except HTTPException as exc:
        assert exc.status_code == 429
        assert exc.headers["Retry-After"] == "60"
    finally:
        main._auth_attempts.clear()
