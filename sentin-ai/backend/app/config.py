"""Runtime configuration, read from environment variables (see ../.env.example)."""
from __future__ import annotations

import os
import secrets
from functools import lru_cache
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BACKEND_DIR / "data"


def _bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, default))
    except ValueError:
        return default


def _load_or_create_secret(is_production: bool) -> str:
    """JWT/encryption secret. Persisted to data/ in development so restarts keep sessions."""
    configured = os.getenv("JWT_SECRET")
    if configured:
        if len(configured) < 32:
            raise RuntimeError("JWT_SECRET must be at least 32 characters")
        return configured
    if is_production:
        raise RuntimeError("JWT_SECRET must be set when SENTIN_ENV=production")
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = DATA_DIR / "secret.key"
    if path.exists():
        return path.read_text().strip()
    value = secrets.token_urlsafe(48)
    path.write_text(value)
    os.chmod(path, 0o600)
    return value


class Settings:
    def __init__(self) -> None:
        self.env = os.getenv("SENTIN_ENV", "development").lower()
        self.is_production = self.env == "production"
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        self.database_url = os.getenv("DATABASE_URL", f"sqlite:///{DATA_DIR / 'sentin.db'}")
        self.jwt_secret = _load_or_create_secret(self.is_production)
        self.jwt_ttl_hours = _int("JWT_TTL_HOURS", 12)
        self.cookie_secure = _bool("COOKIE_SECURE", self.is_production)
        self.cors_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()]
        # Targets that resolve to private/loopback addresses are blocked (SSRF guard) unless enabled.
        self.allow_private_targets = _bool("ALLOW_PRIVATE_TARGETS", not self.is_production)
        # Demo targets are intentionally vulnerable; they are on in development and off in production by default.
        self.enable_demo_targets = _bool("ENABLE_DEMO_TARGETS", not self.is_production)
        self.seed_demo_data = _bool("SEED_DEMO_DATA", not self.is_production)
        self.worker_embedded = _bool("WORKER_EMBEDDED", True)
        self.worker_poll_seconds = float(os.getenv("WORKER_POLL_SECONDS", "0.5"))
        # Artificial delay between checks so the live Red/Blue view is readable in demos.
        self.step_delay_ms = _int("EVAL_STEP_DELAY_MS", 350 if not self.is_production else 0)
        self.http_timeout_seconds = float(os.getenv("HTTP_TIMEOUT_SECONDS", "6"))
        self.max_response_bytes = _int("MAX_RESPONSE_BYTES", 65536)
        self.public_api_base = os.getenv("PUBLIC_API_BASE", "http://127.0.0.1:8000").rstrip("/")
        self.admin_email = os.getenv("ADMIN_EMAIL", "admin@sentin-ai.dev")
        self.admin_password = os.getenv("ADMIN_PASSWORD")  # generated + written to data/ when absent
        self.login_max_attempts = _int("LOGIN_MAX_ATTEMPTS", 8)
        self.login_window_seconds = _int("LOGIN_WINDOW_SECONDS", 900)


@lru_cache
def get_settings() -> Settings:
    return Settings()
