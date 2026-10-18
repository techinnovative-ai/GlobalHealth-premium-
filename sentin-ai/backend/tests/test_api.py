from app.db import SessionLocal
from app.models import AuditRecord
from app.runner import run_evaluation
from app.models import Evaluation
from sqlalchemy import select

CSRF = {"X-Sentin-CSRF": "1"}


def _login(client, email, password):
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r


def test_login_sets_httponly_cookie_and_me_works(client):
    client.cookies.clear()
    r = _login(client, "admin@sentin-ai.dev", "AdminPass!2026")
    assert "httponly" in r.headers["set-cookie"].lower()
    assert client.get("/api/auth/me").json()["role"] == "admin"


def test_bad_password_rejected(client):
    client.cookies.clear()
    r = client.post("/api/auth/login", json={"email": "admin@sentin-ai.dev", "password": "nope"})
    assert r.status_code == 401


def test_cookie_writes_require_csrf_header(client):
    _login(client, "admin@sentin-ai.dev", "AdminPass!2026")
    r = client.post("/api/evaluations", json={"target_id": 1})
    assert r.status_code == 403
    assert "CSRF" in r.json()["detail"]


def test_anonymous_is_unauthorised(client):
    client.cookies.clear()
    assert client.get("/api/targets").status_code == 401


def test_viewer_is_read_only_and_cannot_see_evidence(client):
    _login(client, "admin@sentin-ai.dev", "AdminPass!2026")
    client.post("/api/auth/register", json={"email": "viewer@example.com", "name": "Viewer One",
                                            "password": "ViewerPass!2026"})
    users = client.get("/api/users").json()
    uid = next(u["id"] for u in users if u["email"] == "viewer@example.com")
    assert client.patch(f"/api/users/{uid}", json={"role": "viewer"}, headers=CSRF).status_code == 200

    client.cookies.clear()
    _login(client, "viewer@example.com", "ViewerPass!2026")
    r = client.post("/api/targets", json={"name": "Nope", "kind": "website", "endpoint": "https://example.com",
                                          "authorization_attested": True}, headers=CSRF)
    assert r.status_code == 403
    assert client.get("/api/users").status_code == 403
    assert client.get("/api/audit").status_code == 403


def test_ssrf_guard_blocks_metadata_endpoint(client):
    _login(client, "admin@sentin-ai.dev", "AdminPass!2026")
    r = client.post("/api/targets", json={"name": "Metadata", "kind": "website",
                                          "endpoint": "http://169.254.169.254/latest/",
                                          "authorization_attested": True}, headers=CSRF)
    assert r.status_code == 422


def test_attestation_is_required(client):
    _login(client, "admin@sentin-ai.dev", "AdminPass!2026")
    r = client.post("/api/targets", json={"name": "Unattested", "kind": "website",
                                          "endpoint": "https://example.com", "authorization_attested": False},
                    headers=CSRF)
    assert r.status_code == 422


def test_credentials_are_never_returned(client):
    _login(client, "admin@sentin-ai.dev", "AdminPass!2026")
    r = client.post("/api/targets", json={"name": "Keyed API", "kind": "model_api", "adapter": "generic",
                                          "endpoint": "https://example.com/v1/chat",
                                          "credential_header": "X-API-Key", "credential_value": "super-secret-value",
                                          "authorization_attested": True}, headers=CSRF)
    assert r.status_code == 201, r.text
    body = r.text
    assert "super-secret-value" not in body
    assert r.json()["has_credential"] is True


def _run_demo(client, name):
    target = next(t for t in client.get("/api/targets").json() if t["name"] == name)
    r = client.post("/api/evaluations", json={"target_id": target["id"]}, headers=CSRF)
    assert r.status_code == 201, r.text
    eval_id = r.json()["id"]
    run_evaluation(eval_id)  # synchronous: same code path the worker uses
    return client.get(f"/api/evaluations/{eval_id}").json()


def test_weak_website_produces_findings(client):
    ev = _run_demo(client, "Northwind Shop · weak demo")
    assert ev["status"] == "completed"
    statuses = {r["test_key"]: r["status"] for r in ev["results"]}
    assert statuses["W-R01"] == "failed"   # .env exposed
    assert statuses["W-R06"] == "failed"   # open redirect
    assert statuses["W-R07"] == "failed"   # reflected input
    assert ev["summary"]["findings"] >= 5


def test_hardened_model_passes_all_checks(client):
    ev = _run_demo(client, "Northwind Assistant · hardened demo")
    assert ev["status"] == "completed"
    failed = [r["test_key"] for r in ev["results"] if r["status"] == "failed"]
    assert failed == []
    assert ev["summary"]["posture"] == "strong"


def test_weak_model_fails_injection_and_auth(client):
    ev = _run_demo(client, "Northwind Assistant · weak demo")
    st = {r["test_key"]: r["status"] for r in ev["results"]}
    assert st["M-R01"] == "failed" and st["M-R03"] == "failed"
    assert st["M-B04"] == "blocked"  # no credential configured on the weak demo


def test_sandbox_isolation_checks_run(client):
    ev = _run_demo(client, "Sandbox · Python probe")
    st = {r["test_key"]: r["status"] for r in ev["results"]}
    assert st["S-R01"] == "passed"  # host secrets scrubbed from the environment
    assert st["S-B01"] == "passed"  # CPU limit enforced
    assert st["S-B02"] == "passed"  # memory limit enforced


def test_report_and_markdown_export(client):
    ev = _run_demo(client, "Northwind Shop · weak demo")
    rep = client.get(f"/api/evaluations/{ev['id']}/report").json()
    assert rep["integrity"]["results_sha256"]
    assert any(f["key"] == "W-R01" for f in rep["findings"])
    md = client.get(f"/api/evaluations/{ev['id']}/report.md")
    assert md.status_code == 200 and "Sentin AI evaluation report" in md.text
    assert "attachment" in md.headers["content-disposition"]


def test_audit_chain_verifies_and_detects_tampering(client):
    _login(client, "admin@sentin-ai.dev", "AdminPass!2026")
    assert client.get("/api/audit/verify").json()["valid"] is True
    db = SessionLocal()
    try:
        row = db.execute(select(AuditRecord).order_by(AuditRecord.id.desc()).limit(1)).scalar_one()
        original = row.actor
        row.actor = "someone-else"
        db.commit()
        assert client.get("/api/audit/verify").json()["valid"] is False
        row.actor = original
        db.commit()
    finally:
        db.close()
    assert client.get("/api/audit/verify").json()["valid"] is True


def test_cancel_queued_evaluation(client):
    _login(client, "admin@sentin-ai.dev", "AdminPass!2026")
    target = next(t for t in client.get("/api/targets").json() if t["name"] == "Northwind Shop · weak demo")
    eval_id = client.post("/api/evaluations", json={"target_id": target["id"]}, headers=CSRF).json()["id"]
    r = client.post(f"/api/evaluations/{eval_id}/cancel", headers=CSRF)
    assert r.status_code == 200 and r.json()["status"] == "cancelled"
    db = SessionLocal()
    try:
        assert db.get(Evaluation, eval_id).status == "cancelled"
    finally:
        db.close()
