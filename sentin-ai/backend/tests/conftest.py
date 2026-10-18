"""Test harness: isolated SQLite database, a real uvicorn server for demo targets, synchronous runs."""
import os
import socket
import tempfile
import threading
import time

_tmp = tempfile.mkdtemp(prefix="sentin-test-")
os.environ.update({
    "SENTIN_ENV": "development",
    "DATABASE_URL": f"sqlite:///{_tmp}/test.db",
    "JWT_SECRET": "test-secret-that-is-long-enough-0123456789",
    "ADMIN_EMAIL": "admin@sentin-ai.dev",
    "ADMIN_PASSWORD": "AdminPass!2026",
    "WORKER_EMBEDDED": "false",
    "EVAL_STEP_DELAY_MS": "0",
    "SEED_DEMO_DATA": "true",
    "ENABLE_DEMO_TARGETS": "true",
})


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


import pytest  # noqa: E402
import uvicorn  # noqa: E402

PORT = _free_port()
os.environ["PUBLIC_API_BASE"] = f"http://127.0.0.1:{PORT}"


@pytest.fixture(scope="session")
def server():
    from app.main import app
    config = uvicorn.Config(app, host="127.0.0.1", port=PORT, log_level="warning")
    srv = uvicorn.Server(config)
    thread = threading.Thread(target=srv.run, daemon=True)
    thread.start()
    for _ in range(100):
        if srv.started:
            break
        time.sleep(0.05)
    yield f"http://127.0.0.1:{PORT}"
    srv.should_exit = True
    thread.join(timeout=5)


@pytest.fixture(scope="session")
def client(server):
    from fastapi.testclient import TestClient
    from app.main import app
    with TestClient(app, base_url="http://localhost") as c:
        yield c
