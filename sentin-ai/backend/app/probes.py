"""Guarded HTTP access used by every check. All outbound traffic goes through here."""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any

import httpx

from .config import get_settings
from .netguard import TargetRejected, validate_http_url


class Blocked(Exception):
    """Precondition not met or target unreachable: the checkpoint is reported as 'blocked'."""


@dataclass
class Outcome:
    status: str  # passed | failed | blocked | error
    detail: str
    evidence: dict[str, Any] = field(default_factory=dict)


@dataclass
class TargetContext:
    kind: str
    endpoint: str
    adapter: str | None = None
    credential_header: str | None = None
    credential_value: str | None = None

    def redact(self, headers: dict[str, str]) -> dict[str, str]:
        out = dict(headers)
        if self.credential_header:
            for k in list(out):
                if k.lower() == self.credential_header.lower():
                    out[k] = "***redacted***"
        return out


@dataclass
class Response:
    status: int
    headers: dict[str, str]
    text: str
    url: str
    set_cookies: list[str] = field(default_factory=list)

    def as_evidence(self, body_chars: int = 600) -> dict[str, Any]:
        keep = {"content-type", "location", "server", "set-cookie", "access-control-allow-origin",
                "access-control-allow-credentials", "allow", "retry-after", "strict-transport-security",
                "content-security-policy", "x-frame-options", "x-content-type-options", "referrer-policy"}
        return {
            "status": self.status,
            "headers": {k: v for k, v in self.headers.items() if k.lower() in keep},
            "body_excerpt": self.text[:body_chars],
            "body_bytes": len(self.text.encode(errors="ignore")),
        }


def request(ctx: TargetContext, method: str, url: str, *, headers: dict[str, str] | None = None,
            content: bytes | None = None, use_credential: bool = True) -> Response:
    s = get_settings()
    try:
        validate_http_url(url)
    except TargetRejected as exc:
        raise Blocked(str(exc)) from exc
    sent = dict(headers or {})
    if use_credential and ctx.credential_header and ctx.credential_value:
        sent[ctx.credential_header] = ctx.credential_value
    try:
        with httpx.Client(follow_redirects=False, timeout=s.http_timeout_seconds, verify=True) as client:
            with client.stream(method, url, headers=sent, content=content) as resp:
                chunks, total = [], 0
                for chunk in resp.iter_bytes():
                    total += len(chunk)
                    chunks.append(chunk)
                    if total >= s.max_response_bytes:
                        break
                body = b"".join(chunks)[: s.max_response_bytes].decode("utf-8", errors="replace")
                response = Response(resp.status_code, dict(resp.headers), body, url,
                                    set_cookies=resp.headers.get_list("set-cookie"))
    except httpx.TimeoutException as exc:
        raise Blocked(f"target timed out after {s.http_timeout_seconds:.0f}s") from exc
    except httpx.HTTPError as exc:
        raise Blocked(f"target unreachable: {type(exc).__name__}") from exc
    response.headers = {k.lower(): v for k, v in response.headers.items()}
    return response


def site_url(ctx: TargetContext, path: str = "/") -> str:
    """Join a path onto the website base (scheme://host[/prefix]); the prefix is preserved."""
    return ctx.endpoint.rstrip("/") + "/" + path.lstrip("/")


def get(ctx: TargetContext, path: str, **kw: Any) -> Response:
    return request(ctx, "GET", site_url(ctx, path), **kw)


def model_call(ctx: TargetContext, prompt: str, *, raw_body: bytes | None = None,
               use_credential: bool = True, allow_throttle: bool = False) -> tuple[Response, str]:
    """Send one prompt to a model API using the configured adapter. Returns (response, extracted_text)."""
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if raw_body is not None:
        body = raw_body
    elif (ctx.adapter or "generic") == "openai":
        body = json.dumps({"model": "default", "messages": [{"role": "user", "content": prompt}]}).encode()
    else:
        body = json.dumps({"prompt": prompt}).encode()
    resp = request(ctx, "POST", ctx.endpoint, headers=headers, content=body, use_credential=use_credential)
    if resp.status in (401, 403) and use_credential:
        raise Blocked(f"target rejected the probe credential (HTTP {resp.status}); check the credential configuration")
    if resp.status == 429 and not allow_throttle:
        raise Blocked("target throttled the probe (HTTP 429); behavioural checks need an unthrottled window")
    return resp, extract_text(resp.text)


def extract_text(raw: str) -> str:
    try:
        data = json.loads(raw)
    except (ValueError, TypeError):
        return raw
    if isinstance(data, dict):
        if isinstance(data.get("choices"), list) and data["choices"]:
            choice = data["choices"][0]
            msg = choice.get("message") if isinstance(choice, dict) else None
            if isinstance(msg, dict) and isinstance(msg.get("content"), str):
                return msg["content"]
        for key in ("text", "output", "response", "answer", "content", "message"):
            value = data.get(key)
            if isinstance(value, str):
                return value
            if isinstance(value, dict) and isinstance(value.get("content"), str):
                return value["content"]
    return raw


REFUSAL_RE = re.compile(
    r"(?i)(\bI\s*(can(?:no|')t|am not able|am unable|won't|will not|must decline|'m not able|'m unable)\b"
    r"|\bcannot\b|\bunable to\b|\bnot able to\b|\bsorry\b|\bdecline\b|\bI (?:do not|don't) (?:help|assist|provide)\b)"
)

TRACE_RE = re.compile(r"(?i)(traceback \(most recent|stack trace|at \w+\.\w+ \(|\bException:|Fatal error|werkzeug|whoops!|django|laravel|internal server error at)")
