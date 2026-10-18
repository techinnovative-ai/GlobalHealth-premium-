"""Evaluation lifecycle: enqueue (create checkpoints), execute checks, summarise."""
from __future__ import annotations

import logging
import time
from collections import Counter
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from . import audit
from .checks import CHECKS_BY_KEY, SEVERITIES, Check, catalog_for, ordered_for_run
from .config import get_settings
from .db import SessionLocal
from .models import Evaluation, Target, TestResult, utcnow
from .probes import Blocked, Outcome, TargetContext
from .security import decrypt_secret

log = logging.getLogger("sentin.runner")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def build_context(target: Target) -> TargetContext:
    value = decrypt_secret(target.credential_enc) if target.credential_enc else None
    return TargetContext(
        kind=target.kind,
        endpoint=target.endpoint,
        adapter=target.adapter,
        credential_header=target.credential_header if value else None,
        credential_value=value,
    )


def select_checks(target: Target, test_keys: list[str] | None) -> list[Check]:
    available = catalog_for(target.kind)
    if test_keys:
        unknown = [k for k in test_keys if k not in CHECKS_BY_KEY]
        if unknown:
            raise ValueError(f"unknown test keys: {', '.join(unknown)}")
        wanted = set(test_keys)
        available = [c for c in available if c.key in wanted]
    if not available:
        raise ValueError("no tests selected for this target type")
    return ordered_for_run(available)


def create_evaluation(db: Session, target: Target, actor: str, test_keys: list[str] | None) -> Evaluation:
    checks = select_checks(target, test_keys)
    ev = Evaluation(target=target, created_by=actor, status="queued",
                    test_keys=[c.key for c in checks], created_at=utcnow())
    for position, check in enumerate(checks):
        ev.results.append(TestResult(
            position=position, test_key=check.key, route=check.route, category=check.category,
            title=check.title, severity=check.severity, status="pending",
            remediation=check.remediation, detail="Queued",
        ))
    db.add(ev)
    db.commit()
    audit.record(db, actor, "evaluation.queued", f"evaluation:{ev.id}",
                 {"target_id": target.id, "tests": len(checks)})
    return ev


def _apply(result: TestResult, outcome: Outcome) -> None:
    result.status = outcome.status
    result.detail = outcome.detail
    result.evidence = outcome.evidence
    result.finished_at = _now()


def run_evaluation(evaluation_id: int) -> None:
    """Execute every checkpoint of an evaluation. Safe to call from the worker only once per id."""
    db = SessionLocal()
    try:
        ev = db.get(Evaluation, evaluation_id)
        if ev is None:
            return
        target = db.get(Target, ev.target_id)
        ev.status = "running"
        ev.started_at = _now()
        db.commit()
        audit.record(db, "worker", "evaluation.started", f"evaluation:{ev.id}", {"target_id": target.id})

        ctx = build_context(target)
        step_delay = get_settings().step_delay_ms / 1000.0
        cancelled = False
        for result in list(ev.results):
            db.refresh(ev, attribute_names=["cancel_requested"])
            if ev.cancel_requested:
                cancelled = True
                result.status = "blocked"
                result.detail = "Evaluation cancelled before this checkpoint ran"
                result.finished_at = _now()
                db.commit()
                continue
            check = CHECKS_BY_KEY[result.test_key]
            result.status = "running"
            result.started_at = _now()
            db.commit()
            try:
                outcome = check.fn(ctx)
            except Blocked as exc:
                outcome = Outcome("blocked", str(exc), {})
            except Exception as exc:  # defensive: one broken check must not stop the run
                log.exception("check %s crashed", check.key)
                outcome = Outcome("error", f"internal check error: {type(exc).__name__}", {})
            _apply(result, outcome)
            db.commit()
            if step_delay:
                time.sleep(step_delay)

        ev.summary = summarise(ev.results)
        ev.status = "cancelled" if cancelled else "completed"
        ev.finished_at = _now()
        db.commit()
        audit.record(db, "worker", f"evaluation.{ev.status}", f"evaluation:{ev.id}",
                     {"score": ev.summary.get("overall_score"), "findings": ev.summary["findings"]})
    except Exception as exc:
        log.exception("evaluation %s failed", evaluation_id)
        db.rollback()
        ev = db.get(Evaluation, evaluation_id)
        if ev is not None:
            ev.status = "failed"
            ev.error = f"runner error: {type(exc).__name__}"
            ev.finished_at = _now()
            for r in ev.results:
                if r.status in ("pending", "running"):
                    r.status = "error"
                    r.detail = "Evaluation aborted"
                    r.finished_at = _now()
            db.commit()
    finally:
        db.close()


def _rate(passed: int, failed: int) -> float | None:
    total = passed + failed
    return round(100.0 * passed / total, 1) if total else None


def summarise(results: list[TestResult]) -> dict[str, Any]:
    routes: dict[str, Counter] = {"red": Counter(), "blue": Counter()}
    categories: dict[str, Counter] = {}
    severity = Counter()
    for r in results:
        routes[r.route][r.status] += 1
        categories.setdefault(r.category, Counter())[r.status] += 1
        if r.status == "failed":
            severity[r.severity] += 1
    by_route = {}
    for route, c in routes.items():
        by_route[route] = {
            "total": sum(c.values()), "passed": c["passed"], "failed": c["failed"],
            "blocked": c["blocked"], "error": c["error"],
            "resilience_score": _rate(c["passed"], c["failed"]),
        }
    by_category = {
        name: {"passed": c["passed"], "failed": c["failed"], "blocked": c["blocked"], "error": c["error"],
               "score": _rate(c["passed"], c["failed"])}
        for name, c in sorted(categories.items())
    }
    total_passed = sum(c["passed"] for c in routes.values())
    total_failed = sum(c["failed"] for c in routes.values())
    if severity["critical"]:
        posture = "critical"
    elif severity["high"]:
        posture = "high"
    elif severity["medium"] or severity["low"]:
        posture = "moderate"
    elif total_failed == 0 and total_passed:
        posture = "strong"
    else:
        posture = "insufficient data"
    return {
        "routes": by_route,
        "categories": by_category,
        "severity_counts": {s: severity[s] for s in SEVERITIES},
        "findings": total_failed,
        "overall_score": _rate(total_passed, total_failed),
        "posture": posture,
        "checkpoints": len(results),
        "blocked": sum(1 for r in results if r.status == "blocked"),
        "errors": sum(1 for r in results if r.status == "error"),
    }
