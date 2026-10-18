from __future__ import annotations

import logging
import os
import secrets
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import func, select

from . import api, audit
from .config import DATA_DIR, get_settings
from .db import Base, SessionLocal, engine
from .demo import router as demo_router
from .models import Target, User
from .security import hash_password
from .worker import recover_interrupted, start_embedded_workers

log = logging.getLogger("sentin")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

DEMO_TARGETS = [
    dict(name="Northwind Shop · weak demo", kind="website", endpoint="{base}/demo/site/weak",
         description="Intentionally vulnerable storefront used to show Red findings and missing Blue controls."),
    dict(name="Northwind Shop · hardened demo", kind="website", endpoint="{base}/demo/site/hardened",
         description="Same storefront with security headers, escaping, throttling and hidden files blocked."),
    dict(name="Northwind Assistant · weak demo", kind="model_api", adapter="generic", endpoint="{base}/demo/model/weak",
         description="Naive chat API: follows injected instructions, leaks its instructions, no authentication."),
    dict(name="Northwind Assistant · hardened demo", kind="model_api", adapter="openai",
         endpoint="{base}/demo/model/hardened", credential_header="X-API-Key", credential_value="demo-key-7731",
         description="Guarded chat API: API key required, refusals, size limits and burst throttling."),
    dict(name="Sandbox · Python probe", kind="sandbox", endpoint="sandbox://python-probe",
         description="Runs bundled probes in a scrubbed, resource-limited child process."),
]


def _seed() -> None:
    s = get_settings()
    db = SessionLocal()
    try:
        if db.execute(select(func.count()).select_from(User)).scalar_one() == 0:
            password = s.admin_password
            generated = False
            if not password:
                password = secrets.token_urlsafe(18)
                generated = True
            db.add(User(email=s.admin_email.lower(), name="Administrator",
                        password_hash=hash_password(password), role="admin"))
            db.commit()
            audit.record(db, "system", "bootstrap.admin_created", s.admin_email.lower())
            if generated:
                path = DATA_DIR / "initial_admin_password.txt"
                path.write_text(f"email: {s.admin_email}\npassword: {password}\n")
                os.chmod(path, 0o600)
                log.warning("Initial admin created. Password written to %s (delete after first sign-in).", path)
        if s.enable_demo_targets and s.seed_demo_data:
            existing = {t.name for t in db.execute(select(Target).where(Target.is_demo.is_(True))).scalars()}
            from .security import encrypt_secret
            for spec in DEMO_TARGETS:
                if spec["name"] in existing:
                    continue
                cred = spec.get("credential_value")
                db.add(Target(
                    name=spec["name"], kind=spec["kind"], endpoint=spec["endpoint"].format(base=s.public_api_base),
                    adapter=spec.get("adapter"), description=spec["description"],
                    credential_header=spec.get("credential_header") if cred else None,
                    credential_enc=encrypt_secret(cred) if cred else None, is_demo=True,
                    authorization_attested_by="Sentin built-in demo", owner_id=None,
                ))
            db.commit()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(engine)
    _seed()
    if get_settings().worker_embedded:
        # Only the embedded worker may reclaim interrupted runs; a separate worker process owns its own.
        recover_interrupted()
        start_embedded_workers(int(os.getenv("WORKER_CONCURRENCY", "2")))
        log.info("embedded evaluation workers started")
    yield


def create_app() -> FastAPI:
    s = get_settings()
    app = FastAPI(title="Sentin AI Safety Evaluator API", version="1.0.0", lifespan=lifespan,
                  docs_url="/api/docs", openapi_url="/api/openapi.json")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=s.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "X-Sentin-CSRF"],
    )

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
        if request.url.path.startswith("/api/"):
            response.headers.setdefault("Cache-Control", "no-store")
        return response

    @app.exception_handler(Exception)
    async def unhandled(request: Request, exc: Exception):
        log.exception("unhandled error on %s", request.url.path)
        return JSONResponse({"detail": "internal server error"}, status_code=500)

    app.include_router(api.router)
    if s.enable_demo_targets:
        app.include_router(demo_router)
    return app


app = create_app()
