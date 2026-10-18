"""REST API. Cookie-based sessions (HttpOnly) or Bearer tokens; role-based access control."""
from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from typing import Annotated, Callable

from fastapi import APIRouter, Cookie, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from . import audit
from .checks import CHECKS, SEVERITIES, CHECKS_BY_KEY, SANDBOX_PROFILE
from .config import get_settings
from .db import get_db
from .models import AuditRecord, Evaluation, Target, User, utcnow
from .netguard import TargetRejected, validate_http_url
from .checks import run_probe
from .probes import Blocked, get, model_call
from .runner import build_context, create_evaluation
from .schemas import EvaluationIn, EvaluationOut, LoginIn, RegisterIn, TargetIn, TargetOut, UserOut, UserUpdate
from .security import (
    ROLES, SESSION_COOKIE, create_access_token, decode_access_token, encrypt_secret, hash_password,
    login_throttle, verify_password,
)

router = APIRouter(prefix="/api")
DbSession = Annotated[Session, Depends(get_db)]
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
ROLE_RANK = {"viewer": 0, "analyst": 1, "admin": 2}
_HEADER_RE = re.compile(r"^[A-Za-z0-9-]{1,80}$")


# ------------------------------------------------------------------ auth dependencies
def _load_user(db: Session, token: str | None) -> User | None:
    if not token:
        return None
    claims = decode_access_token(token)
    if not claims:
        return None
    user = db.get(User, int(claims["sub"]))
    if user is None or not user.is_active:
        return None
    return user


def get_current_user(request: Request, db: DbSession,
                     session: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None) -> User:
    auth = request.headers.get("authorization", "")
    bearer = auth[7:] if auth.lower().startswith("bearer ") else None
    user = _load_user(db, bearer or session)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "sign in required")
    # CSRF: cookie-authenticated writes must carry a custom header, which browsers will not send cross-site.
    if request.method not in SAFE_METHODS and not bearer and request.headers.get("x-sentin-csrf") != "1":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "missing CSRF header")
    request.state.actor = user.email
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_role(minimum: str) -> Callable[..., User]:
    def _dep(user: CurrentUser) -> User:
        if ROLE_RANK.get(user.role, -1) < ROLE_RANK[minimum]:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"requires role '{minimum}' or higher")
        return user
    return _dep


Analyst = Annotated[User, Depends(require_role("analyst"))]
Admin = Annotated[User, Depends(require_role("admin"))]


def _user_out(u: User) -> UserOut:
    return UserOut.model_validate(u)


# ------------------------------------------------------------------ auth
@router.post("/auth/register", response_model=UserOut, status_code=201)
def register(body: RegisterIn, db: DbSession):
    email = body.email.lower()
    if db.execute(select(User).where(User.email == email)).scalar_one_or_none():
        raise HTTPException(status.HTTP_409_CONFLICT, "an account with this email already exists")
    user = User(email=email, name=body.name.strip(), password_hash=hash_password(body.password), role="analyst")
    db.add(user)
    db.commit()
    audit.record(db, email, "user.registered", f"user:{user.id}")
    return _user_out(user)


@router.post("/auth/login", response_model=UserOut)
def login(body: LoginIn, request: Request, response: Response, db: DbSession):
    s = get_settings()
    now = datetime.now(timezone.utc).timestamp()
    email = body.email.lower()
    key = f"{request.client.host if request.client else 'unknown'}|{email}"
    if login_throttle.is_blocked(key, now):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "too many failed attempts; try again later")
    user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if user is None or not verify_password(body.password, user.password_hash) or not user.is_active:
        login_throttle.record_failure(key, now)
        audit.record(db, email, "auth.login_failed", "", {"ip": request.client.host if request.client else ""})
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid email or password")
    login_throttle.reset(key)
    response.set_cookie(
        SESSION_COOKIE, create_access_token(user.id, user.role), max_age=s.jwt_ttl_hours * 3600,
        httponly=True, secure=s.cookie_secure, samesite="lax", path="/",
    )
    audit.record(db, user.email, "auth.login", f"user:{user.id}")
    return _user_out(user)


@router.post("/auth/logout", status_code=204)
def logout(response: Response):
    response.delete_cookie(SESSION_COOKIE, path="/")
    response.status_code = status.HTTP_204_NO_CONTENT


@router.get("/auth/me", response_model=UserOut)
def me(user: CurrentUser):
    return _user_out(user)


# ------------------------------------------------------------------ users (admin)
@router.get("/users", response_model=list[UserOut])
def list_users(_: Admin, db: DbSession):
    return [_user_out(u) for u in db.execute(select(User).order_by(User.id)).scalars()]


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(user_id: int, body: UserUpdate, admin: Admin, db: DbSession):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(404, "user not found")
    if user.id == admin.id and (body.is_active is False or (body.role and body.role != "admin")):
        raise HTTPException(409, "you cannot remove your own admin access")
    changes = body.model_dump(exclude_none=True)
    demotes = user.role == "admin" and changes.get("role", "admin") != "admin"
    deactivates = user.role == "admin" and changes.get("is_active") is False
    if demotes or deactivates:
        admins = db.execute(select(func.count()).select_from(User).where(User.role == "admin", User.is_active.is_(True))).scalar_one()
        if admins <= 1:
            raise HTTPException(409, "at least one active admin is required")
    for k, v in changes.items():
        setattr(user, k, v)
    db.commit()
    audit.record(db, admin.email, "user.updated", f"user:{user.id}", changes)
    return _user_out(user)


# ------------------------------------------------------------------ catalog
@router.get("/catalog")
def catalog(_: CurrentUser):
    return [
        {"key": c.key, "route": c.route, "kind": c.kind, "category": c.category, "title": c.title,
         "severity": c.severity, "description": c.description, "remediation": c.remediation}
        for c in CHECKS
    ]


# ------------------------------------------------------------------ targets
def _target_out(t: Target) -> TargetOut:
    return TargetOut(
        id=t.id, name=t.name, kind=t.kind, endpoint=t.endpoint, adapter=t.adapter, description=t.description,
        has_credential=bool(t.credential_enc), credential_header=t.credential_header, is_demo=t.is_demo,
        authorization_attested_by=t.authorization_attested_by, authorized_at=t.authorized_at, created_at=t.created_at,
    )


def _get_target(db: Session, target_id: int) -> Target:
    t = db.get(Target, target_id)
    if t is None:
        raise HTTPException(404, "target not found")
    return t


@router.get("/targets", response_model=list[TargetOut])
def list_targets(_: CurrentUser, db: DbSession):
    return [_target_out(t) for t in db.execute(select(Target).order_by(Target.id.desc())).scalars()]


@router.post("/targets", response_model=TargetOut, status_code=201)
def create_target(body: TargetIn, user: Analyst, db: DbSession):
    endpoint = body.endpoint.strip()
    if body.kind == "sandbox":
        if endpoint != SANDBOX_PROFILE:
            raise HTTPException(422, f"sandbox targets must use the endpoint {SANDBOX_PROFILE}")
    else:
        try:
            validate_http_url(endpoint)
        except TargetRejected as exc:
            raise HTTPException(422, str(exc)) from exc
    if body.kind == "model_api" and not body.adapter:
        raise HTTPException(422, "model API targets need an adapter (generic or openai)")
    if body.kind != "model_api" and body.adapter:
        raise HTTPException(422, "adapter applies only to model API targets")
    credential_enc = header = None
    if body.credential_value:
        if not body.credential_header or not _HEADER_RE.match(body.credential_header):
            raise HTTPException(422, "a valid credential header name is required (e.g. Authorization or X-API-Key)")
        header = body.credential_header
        credential_enc = encrypt_secret(body.credential_value)
    target = Target(
        name=body.name.strip(), kind=body.kind, endpoint=endpoint,
        adapter=body.adapter if body.kind == "model_api" else None, description=body.description.strip(),
        credential_header=header, credential_enc=credential_enc, is_demo=False,
        authorization_attested_by=user.email, authorized_at=utcnow(), owner_id=user.id,
    )
    db.add(target)
    db.commit()
    audit.record(db, user.email, "target.created", f"target:{target.id}",
                 {"kind": target.kind, "endpoint": target.endpoint, "has_credential": bool(credential_enc)})
    return _target_out(target)


@router.get("/targets/{target_id}", response_model=TargetOut)
def get_target(target_id: int, _: CurrentUser, db: DbSession):
    return _target_out(_get_target(db, target_id))


@router.delete("/targets/{target_id}", status_code=204)
def delete_target(target_id: int, user: Analyst, db: DbSession):
    target = _get_target(db, target_id)
    if target.is_demo and user.role != "admin":
        raise HTTPException(403, "only admins can delete demo targets")
    if target.owner_id not in (None, user.id) and user.role != "admin":
        raise HTTPException(403, "only the owner or an admin can delete this target")
    db.delete(target)
    db.commit()
    audit.record(db, user.email, "target.deleted", f"target:{target_id}")


@router.post("/targets/{target_id}/verify")
def verify_target(target_id: int, user: Analyst, db: DbSession):
    """Base Camp step: check connectivity and credentials before running a full evaluation."""
    target = _get_target(db, target_id)
    ctx = build_context(target)
    try:
        if target.kind == "website":
            r = get(ctx, "/")
            result = {"reachable": True, "detail": f"HTTP {r.status} from {target.endpoint}"}
        elif target.kind == "model_api":
            r, text = model_call(ctx, "Reply with the word OK.", allow_throttle=True)
            result = {"reachable": True, "detail": f"HTTP {r.status}; adapter '{target.adapter}' parsed {len(text)} chars"}
        else:
            res = run_probe("print('ready')")
            result = {"reachable": res["returncode"] == 0, "detail": "sandbox launched" if res["returncode"] == 0 else "sandbox failed to start"}
    except Blocked as exc:
        result = {"reachable": False, "detail": str(exc)}
    audit.record(db, user.email, "target.verified", f"target:{target.id}", {"reachable": result["reachable"]})
    return result


# ------------------------------------------------------------------ evaluations
def _eval_out(ev: Evaluation, *, with_results: bool, hide_evidence: bool) -> EvaluationOut:
    results = []
    if with_results:
        for r in ev.results:
            results.append({
                "id": r.id, "position": r.position, "test_key": r.test_key, "route": r.route,
                "category": r.category, "title": r.title, "severity": r.severity, "status": r.status,
                "detail": r.detail, "remediation": r.remediation,
                "evidence": None if hide_evidence else r.evidence,
                "started_at": r.started_at, "finished_at": r.finished_at,
            })
    return EvaluationOut(
        id=ev.id, target_id=ev.target_id, target_name=ev.target.name, target_kind=ev.target.kind,
        status=ev.status, created_by=ev.created_by, test_keys=ev.test_keys or [], summary=ev.summary,
        error=ev.error, created_at=ev.created_at, started_at=ev.started_at, finished_at=ev.finished_at,
        results=results,
    )


def _load_eval(db: Session, eval_id: int) -> Evaluation:
    ev = db.execute(
        select(Evaluation).options(selectinload(Evaluation.results), selectinload(Evaluation.target))
        .where(Evaluation.id == eval_id)
    ).scalar_one_or_none()
    if ev is None:
        raise HTTPException(404, "evaluation not found")
    return ev


@router.post("/evaluations", response_model=EvaluationOut, status_code=201)
def start_evaluation(body: EvaluationIn, user: Analyst, db: DbSession):
    target = _get_target(db, body.target_id)
    try:
        ev = create_evaluation(db, target, user.email, body.test_keys)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    return _eval_out(_load_eval(db, ev.id), with_results=True, hide_evidence=False)


@router.get("/evaluations", response_model=list[EvaluationOut])
def list_evaluations(_: CurrentUser, db: DbSession, target_id: int | None = None, limit: int = Query(50, ge=1, le=200)):
    q = select(Evaluation).options(selectinload(Evaluation.target)).order_by(Evaluation.id.desc()).limit(limit)
    if target_id:
        q = q.where(Evaluation.target_id == target_id)
    return [_eval_out(e, with_results=False, hide_evidence=True) for e in db.execute(q).scalars()]


@router.get("/evaluations/{eval_id}", response_model=EvaluationOut)
def get_evaluation(eval_id: int, user: CurrentUser, db: DbSession):
    ev = _load_eval(db, eval_id)
    return _eval_out(ev, with_results=True, hide_evidence=user.role == "viewer")


@router.post("/evaluations/{eval_id}/cancel", response_model=EvaluationOut)
def cancel_evaluation(eval_id: int, user: Analyst, db: DbSession):
    ev = _load_eval(db, eval_id)
    if ev.status in ("completed", "failed", "cancelled"):
        raise HTTPException(409, f"evaluation already {ev.status}")
    ev.cancel_requested = True
    if ev.status == "queued":
        ev.status = "cancelled"
        ev.finished_at = utcnow()
        for r in ev.results:
            r.status = "blocked"
            r.detail = "Evaluation cancelled before it started"
    db.commit()
    audit.record(db, user.email, "evaluation.cancel_requested", f"evaluation:{eval_id}")
    return _eval_out(_load_eval(db, eval_id), with_results=True, hide_evidence=False)


def _digest(ev: Evaluation) -> str:
    rows = [{"key": r.test_key, "status": r.status, "severity": r.severity, "detail": r.detail,
             "evidence": r.evidence} for r in ev.results]
    return hashlib.sha256(json.dumps(rows, sort_keys=True, default=str).encode()).hexdigest()


def _build_report(ev: Evaluation, *, include_evidence: bool) -> dict:
    findings = [r for r in ev.results if r.status == "failed"]
    findings.sort(key=lambda r: (SEVERITIES.index(r.severity), r.position))
    return {
        "evaluation_id": ev.id,
        "target": {"name": ev.target.name, "kind": ev.target.kind, "endpoint": ev.target.endpoint},
        "status": ev.status,
        "started_at": ev.started_at,
        "finished_at": ev.finished_at,
        "summary": ev.summary,
        "findings": [
            {"key": r.test_key, "route": r.route, "severity": r.severity, "title": r.title,
             "category": r.category, "detail": r.detail, "remediation": r.remediation,
             "evidence": r.evidence if include_evidence else None}
            for r in findings
        ],
        "passed": [{"key": r.test_key, "title": r.title, "route": r.route} for r in ev.results if r.status == "passed"],
        "blocked": [{"key": r.test_key, "title": r.title, "detail": r.detail} for r in ev.results if r.status in ("blocked", "error")],
        "integrity": {"results_sha256": _digest(ev), "generated_at": utcnow()},
    }


@router.get("/evaluations/{eval_id}/report")
def evaluation_report(eval_id: int, user: CurrentUser, db: DbSession):
    ev = _load_eval(db, eval_id)
    if ev.status not in ("completed", "cancelled", "failed"):
        raise HTTPException(409, "report is available once the evaluation has finished")
    return _build_report(ev, include_evidence=user.role != "viewer")


@router.get("/evaluations/{eval_id}/report.md")
def evaluation_report_markdown(eval_id: int, user: CurrentUser, db: DbSession):
    ev = _load_eval(db, eval_id)
    if ev.status not in ("completed", "cancelled", "failed"):
        raise HTTPException(409, "report is available once the evaluation has finished")
    rep = _build_report(ev, include_evidence=False)
    s = rep["summary"] or {}
    lines = [
        f"# Sentin AI evaluation report #{ev.id}", "",
        f"- **Target:** {rep['target']['name']} ({rep['target']['kind']})",
        f"- **Endpoint:** {rep['target']['endpoint']}",
        f"- **Status:** {ev.status}",
        f"- **Posture:** {s.get('posture', 'n/a')}",
        f"- **Overall resilience score:** {s.get('overall_score', 'n/a')}",
        f"- **Results digest (SHA-256):** `{rep['integrity']['results_sha256']}`", "",
        "## Route scores", "", "| Route | Passed | Failed | Blocked/Error | Score |", "|---|---|---|---|---|",
    ]
    for route in ("red", "blue"):
        r = (s.get("routes") or {}).get(route, {})
        lines.append(f"| {route.title()} | {r.get('passed', 0)} | {r.get('failed', 0)} | "
                     f"{r.get('blocked', 0)}/{r.get('error', 0)} | {r.get('resilience_score')} |")
    lines += ["", "## Findings", ""]
    if not rep["findings"]:
        lines.append("No findings. Every executed checkpoint passed.")
    for f in rep["findings"]:
        lines += [f"### [{f['severity'].upper()}] {f['title']} ({f['key']})", "",
                  f"- **Route:** {f['route']} · **Category:** {f['category']}",
                  f"- **Observed:** {f['detail']}", f"- **Remediation:** {f['remediation']}", ""]
    lines += ["## Blocked or errored checkpoints", ""]
    lines += [f"- {b['title']}: {b['detail']}" for b in rep["blocked"]] or ["None."]
    from fastapi.responses import PlainTextResponse
    return PlainTextResponse("\n".join(lines) + "\n", media_type="text/markdown",
                             headers={"Content-Disposition": f'attachment; filename="sentin-report-{ev.id}.md"'})


# ------------------------------------------------------------------ audit & stats
def _audit_out(r: AuditRecord) -> dict:
    return {"id": r.id, "ts": r.ts, "actor": r.actor, "action": r.action, "subject": r.subject,
            "detail": r.detail, "hash": r.hash, "prev_hash": r.prev_hash}


@router.get("/audit")
def list_audit(_: Analyst, db: DbSession, limit: int = Query(100, ge=1, le=500)):
    rows = db.execute(select(AuditRecord).order_by(AuditRecord.id.desc()).limit(limit)).scalars()
    return [_audit_out(r) for r in rows]


@router.get("/audit/verify")
def verify_audit(_: Analyst, db: DbSession):
    return audit.verify_chain(db)


@router.get("/stats")
def stats(_: CurrentUser, db: DbSession):
    targets = db.execute(select(func.count()).select_from(Target)).scalar_one()
    by_status = dict(db.execute(select(Evaluation.status, func.count()).group_by(Evaluation.status)).all())
    completed = db.execute(select(Evaluation).where(Evaluation.status == "completed")
                           .order_by(Evaluation.id.desc()).limit(50)).scalars().all()
    findings = sum((e.summary or {}).get("findings", 0) for e in completed)
    scores = [e.summary["overall_score"] for e in completed if e.summary and e.summary.get("overall_score") is not None]
    severity: dict[str, int] = {s: 0 for s in SEVERITIES}
    for e in completed:
        for k, v in ((e.summary or {}).get("severity_counts") or {}).items():
            severity[k] = severity.get(k, 0) + v
    recent = db.execute(select(Evaluation).options(selectinload(Evaluation.target))
                        .order_by(Evaluation.id.desc()).limit(6)).scalars().all()
    return {
        "targets": targets,
        "evaluations": sum(by_status.values()),
        "by_status": by_status,
        "open_findings": findings,
        "average_score": round(sum(scores) / len(scores), 1) if scores else None,
        "severity_counts": severity,
        "recent": [_eval_out(e, with_results=False, hide_evidence=True).model_dump(mode="json") for e in recent],
        "checks_in_library": len(CHECKS_BY_KEY),
    }


@router.get("/health")
def health():
    return {"status": "ok", "service": "sentin-ai-api", "roles": list(ROLES)}
