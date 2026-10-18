from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from cryptography.fernet import Fernet

from .config import get_settings

ROLES = ("admin", "analyst", "viewer")
SESSION_COOKIE = "sentin_session"
_SCRYPT_N, _SCRYPT_R, _SCRYPT_P = 2**14, 8, 1


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P, dklen=32)
    return f"scrypt${_SCRYPT_N}${_SCRYPT_R}${_SCRYPT_P}${base64.b64encode(salt).decode()}${base64.b64encode(digest).decode()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, n, r, p, salt_b64, digest_b64 = stored.split("$")
        expected = base64.b64decode(digest_b64)
        actual = hashlib.scrypt(
            password.encode(), salt=base64.b64decode(salt_b64), n=int(n), r=int(r), p=int(p), dklen=len(expected)
        )
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def create_access_token(user_id: int, role: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "role": role,
        "iat": now,
        "exp": now + timedelta(hours=get_settings().jwt_ttl_hours),
        "typ": "session",
    }
    return jwt.encode(payload, get_settings().jwt_secret, algorithm="HS256")


def decode_access_token(token: str) -> dict | None:
    try:
        claims = jwt.decode(token, get_settings().jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
    return claims if claims.get("typ") == "session" else None


def _fernet() -> Fernet:
    key = hashlib.sha256(b"sentin-credential-v1:" + get_settings().jwt_secret.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def encrypt_secret(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def decrypt_secret(token: str) -> str:
    return _fernet().decrypt(token.encode()).decode()


class LoginThrottle:
    """Sliding-window limiter for failed logins, keyed by client IP + email."""

    def __init__(self) -> None:
        self._failures: dict[str, list[float]] = {}

    def _prune(self, key: str, now: float, window: float) -> list[float]:
        items = [t for t in self._failures.get(key, []) if now - t < window]
        self._failures[key] = items
        return items

    def is_blocked(self, key: str, now: float) -> bool:
        s = get_settings()
        return len(self._prune(key, now, s.login_window_seconds)) >= s.login_max_attempts

    def record_failure(self, key: str, now: float) -> None:
        self._prune(key, now, get_settings().login_window_seconds).append(now)

    def reset(self, key: str) -> None:
        self._failures.pop(key, None)


login_throttle = LoginThrottle()
