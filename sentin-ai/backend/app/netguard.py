"""SSRF and scope guard: every outbound probe is checked against this module.

Targets must be public hosts unless ALLOW_PRIVATE_TARGETS is enabled (development only).
Only http/https schemes and ports are allowed; credentials in URLs are rejected.
"""
from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlsplit

from .config import get_settings

ALLOWED_SCHEMES = {"http", "https"}


class TargetRejected(ValueError):
    pass


def _always_blocked(ip: ipaddress._BaseAddress) -> bool:
    """Blocked in every environment: link-local (cloud metadata), unspecified, multicast, reserved."""
    return ip.is_link_local or ip.is_unspecified or ip.is_multicast or (ip.is_reserved and not ip.is_loopback)


def _is_public(ip: ipaddress._BaseAddress) -> bool:
    return not (ip.is_private or ip.is_loopback or _always_blocked(ip))


def resolve_host(host: str, port: int) -> list[ipaddress._BaseAddress]:
    try:
        infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise TargetRejected(f"host '{host}' does not resolve") from exc
    addresses = []
    for info in infos:
        try:
            addresses.append(ipaddress.ip_address(info[4][0].split("%", 1)[0]))
        except ValueError:
            continue
    if not addresses:
        raise TargetRejected(f"host '{host}' has no usable address")
    return addresses


def validate_http_url(url: str, *, check_dns: bool = True) -> None:
    parts = urlsplit(url)
    if parts.scheme not in ALLOWED_SCHEMES:
        raise TargetRejected("only http:// and https:// targets are allowed")
    if not parts.hostname:
        raise TargetRejected("target URL has no host")
    if parts.username or parts.password:
        raise TargetRejected("credentials must not be embedded in the URL; use the credential field")
    if len(url) > 500:
        raise TargetRejected("target URL is too long")
    if not check_dns:
        return
    port = parts.port or (443 if parts.scheme == "https" else 80)
    allow_private = get_settings().allow_private_targets
    for ip in resolve_host(parts.hostname, port):
        if _always_blocked(ip):
            raise TargetRejected(f"host '{parts.hostname}' resolves to a reserved address ({ip}); this is never allowed")
        if not allow_private and not _is_public(ip):
            raise TargetRejected(
                f"host '{parts.hostname}' resolves to a non-public address ({ip}); "
                "private and loopback targets are blocked in production"
            )
