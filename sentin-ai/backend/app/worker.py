"""Background evaluation worker.

Durable, database-backed queue: evaluations are claimed atomically (status queued -> running),
so several worker threads or processes can share one database safely.
Run standalone with:  python -m app.worker
"""
from __future__ import annotations

import logging
import signal
import threading

from sqlalchemy import select, update

from . import audit
from .config import get_settings
from .db import SessionLocal
from .models import Evaluation, utcnow
from .runner import run_evaluation

log = logging.getLogger("sentin.worker")
_stop = threading.Event()


def recover_interrupted() -> None:
    """Evaluations left 'running' by a crashed process are marked failed (never silently re-run)."""
    db = SessionLocal()
    try:
        stale = db.execute(select(Evaluation).where(Evaluation.status.in_(["running", "claimed"]))).scalars().all()
        for ev in stale:
            ev.status = "failed"
            ev.error = "interrupted by worker restart"
            ev.finished_at = utcnow()
            for r in ev.results:
                if r.status in ("pending", "running"):
                    r.status = "error"
                    r.detail = "Interrupted by worker restart"
            audit.record(db, "worker", "evaluation.interrupted", f"evaluation:{ev.id}")
        db.commit()
    finally:
        db.close()


def _claim_next() -> int | None:
    db = SessionLocal()
    try:
        candidate = db.execute(
            select(Evaluation.id).where(Evaluation.status == "queued").order_by(Evaluation.id).limit(1)
        ).scalar_one_or_none()
        if candidate is None:
            return None
        res = db.execute(
            update(Evaluation).where(Evaluation.id == candidate, Evaluation.status == "queued")
            .values(status="claimed")
        )
        db.commit()
        return candidate if res.rowcount == 1 else None
    finally:
        db.close()


def worker_loop(stop: threading.Event | None = None) -> None:
    stop = stop or _stop
    poll = get_settings().worker_poll_seconds
    while not stop.is_set():
        eval_id = _claim_next()
        if eval_id is None:
            stop.wait(poll)
            continue
        log.info("running evaluation %s", eval_id)
        run_evaluation(eval_id)


def start_embedded_workers(count: int = 2) -> list[threading.Thread]:
    threads = []
    for i in range(count):
        t = threading.Thread(target=worker_loop, name=f"sentin-worker-{i}", daemon=True)
        t.start()
        threads.append(t)
    return threads


def main() -> None:  # pragma: no cover - process entry point
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    recover_interrupted()
    signal.signal(signal.SIGTERM, lambda *_: _stop.set())
    log.info("worker started")
    try:
        worker_loop()
    except KeyboardInterrupt:
        _stop.set()


if __name__ == "__main__":  # pragma: no cover
    main()
