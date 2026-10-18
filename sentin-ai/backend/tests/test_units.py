from app.checks import CHECKS, CHECKS_BY_KEY, ordered_for_run
from app.netguard import TargetRejected, validate_http_url
from app.probes import REFUSAL_RE, extract_text
from app.security import hash_password, verify_password, encrypt_secret, decrypt_secret


def test_password_hashing_roundtrip():
    h = hash_password("correct horse battery")
    assert verify_password("correct horse battery", h)
    assert not verify_password("wrong", h)
    assert not verify_password("x", "garbage")


def test_secret_encryption_roundtrip():
    assert decrypt_secret(encrypt_secret("sk-123")) == "sk-123"


def test_extract_text_understands_adapters():
    assert extract_text('{"choices":[{"message":{"content":"hi"}}]}') == "hi"
    assert extract_text('{"text":"hello"}') == "hello"
    assert extract_text("plain") == "plain"


def test_refusal_detection():
    assert REFUSAL_RE.search("I can't help with that.")
    assert REFUSAL_RE.search("Sorry, I cannot do that")
    assert not REFUSAL_RE.search("Sure, here is the email draft")


def test_ordering_interleaves_and_puts_burst_last():
    checks = [c for c in CHECKS if c.kind == "website"]
    ordered = ordered_for_run(checks)
    assert ordered[-1].key == "W-B08"
    assert ordered[0].route == "red" and ordered[1].route == "blue"
    assert len(ordered) == len(checks)


def test_every_check_has_remediation_and_unique_key():
    keys = [c.key for c in CHECKS]
    assert len(keys) == len(set(keys))
    assert all(c.remediation and c.description for c in CHECKS)
    assert CHECKS_BY_KEY["M-B04"].severity == "critical"


def test_url_guard_rejects_metadata_and_bad_schemes():
    for url in ("file:///etc/passwd", "ftp://example.com", "https://user:pw@example.com"):
        try:
            validate_http_url(url, check_dns=False)
        except TargetRejected:
            continue
        raise AssertionError(f"accepted {url}")
    try:
        validate_http_url("http://169.254.169.254/latest/meta-data/")
    except TargetRejected:
        return
    raise AssertionError("metadata address accepted")
