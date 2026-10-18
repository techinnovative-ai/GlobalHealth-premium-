"""Hash-chained audit log. Tampering with any record breaks verification."""
from __future__ import annotations

import hashlib
import json
import threading
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import AuditRecord, utcnow

GENESIS = "0" * 64
_lock = threading.Lock()


def _ts_key(ts: datetime) -> str:
    """Canonical UTC timestamp so hashes survive round-trips through SQLite (which drops tzinfo)."""
    if ts.tzinfo is not None:
        ts = ts.astimezone(timezone.utc).replace(tzinfo=None)
    return ts.replace(microsecond=0).isoformat()


def _digest(prev_hash: str, ts_iso: str, actor: str, action: str, subject: str, detail: dict[str, Any]) -> str:
    canonical = json.dumps(
        {"prev": prev_hash, "ts": ts_iso, "actor": actor, "action": action, "subject": subject, "detail": detail},
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    )
    return hashlib.sha256(canonical.encode()).hexdigest()


def record(db: Session, actor: str, action: str, subject: str = "", detail: dict[str, Any] | None = None) -> AuditRecord:
    detail = detail or {}
    with _lock:
        last = db.execute(select(AuditRecord).order_by(AuditRecord.id.desc()).limit(1)).scalar_one_or_none()
        prev = last.hash if last else GENESIS
        ts = utcnow()
        digest = _digest(prev, _ts_key(ts), actor, action, subject, detail)
        row = AuditRecord(ts=ts, actor=actor, action=action, subject=subject, detail=detail, prev_hash=prev, hash=digest)
        db.add(row)
        db.commit()
        return row


def verify_chain(db: Session) -> dict[str, Any]:
    rows = db.execute(select(AuditRecord).order_by(AuditRecord.id.asc())).scalars().all()
    expected_prev = GENESIS
    for row in rows:
        recomputed = _digest(row.prev_hash, _ts_key(row.ts), row.actor, row.action, row.subject, row.detail or {})
        if row.prev_hash != expected_prev or recomputed != row.hash:
            return {"valid": False, "records": len(rows), "broken_at_id": row.id}
        expected_prev = row.hash
    return {"valid": True, "records": len(rows), "broken_at_id": None}
