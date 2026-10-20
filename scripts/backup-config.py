"""Offline backup configuration gate. Never print values or parser errors."""
import os
import re
import sys
from urllib.parse import parse_qs, urlsplit


def require_settings(env, names):
    for name in names:
        if not env.get(name, "").strip():
            raise ValueError(f"Required backup setting is missing: {name}")


def validate_core(env):
    require_settings(env, (
        "SUPABASE_PROJECT_REF", "SUPABASE_DB_SESSION_POOLER_URL",
        "BACKUP_ENCRYPTION_RECIPIENT",
    ))
    ref = env["SUPABASE_PROJECT_REF"]
    if not re.fullmatch(r"[a-z]{20}", ref):
        raise ValueError("Backup project reference is invalid")
    try:
        raw = env["SUPABASE_DB_SESSION_POOLER_URL"]
        url = urlsplit(raw)
        query = parse_qs(url.query, keep_blank_values=True)
        valid = (
            not re.search(r"[\s\x00-\x1f\x7f]", raw)
            and url.scheme == "postgresql"
            and url.username == f"postgres.{ref}"
            and bool(url.password)
            and url.hostname is not None
            and re.fullmatch(r"[a-z0-9-]+\.pooler\.supabase\.com", url.hostname)
            and url.port == 5432 and url.path == "/postgres" and not url.fragment
            and set(query) == {"sslmode"}
            and query.get("sslmode") in (["require"], ["verify-ca"], ["verify-full"])
        )
    except (ValueError, TypeError):
        valid = False
    if not valid:
        raise ValueError("Backup URL must select the expected session-pooler project with TLS")
    if not env["BACKUP_ENCRYPTION_RECIPIENT"].startswith(("age1", "ssh-")):
        raise ValueError("Backup encryption recipient is invalid")


def validate_durable(env):
    require_settings(env, (
        "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BACKUP_BUCKET",
    ))
    if not re.fullmatch(r"[a-f0-9]{32}", env["R2_ACCOUNT_ID"]):
        raise ValueError("R2 account configuration is invalid")
    if not re.fullmatch(r"[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]", env["R2_BACKUP_BUCKET"]):
        raise ValueError("R2 backup bucket configuration is invalid")


def validate_monitor(env):
    require_settings(env, ("HEALTHCHECKS_BACKUP_PING_URL",))
    try:
        raw = env["HEALTHCHECKS_BACKUP_PING_URL"]
        monitor = urlsplit(raw)
        valid = (
            not re.search(r"[\s\x00-\x1f\x7f]", raw)
            and monitor.scheme == "https" and not monitor.username and not monitor.password
            and monitor.port in (None, 443) and not monitor.query and not monitor.fragment
            and monitor.hostname is not None
            and re.fullmatch(r"(?:[a-z0-9-]+\.)+[a-z]{2,63}", monitor.hostname)
            and not monitor.hostname.endswith((".local", ".internal", ".localhost"))
            and monitor.path not in ("", "/") and not monitor.path.endswith("/")
        )
    except (ValueError, TypeError):
        valid = False
    if not valid:
        raise ValueError("Backup monitor must be a private HTTPS ping endpoint")


def validate(env):
    # Full readiness remains strict. Workflow phases merely place destination
    # checks after retaining an independently validated encrypted artifact.
    validate_core(env)
    validate_durable(env)
    validate_monitor(env)


if __name__ == "__main__":
    try:
        phases = {
            "core": validate_core,
            "durable": validate_durable,
            "monitor": validate_monitor,
        }
        if len(sys.argv) == 1:
            validate(os.environ)
        elif len(sys.argv) == 3 and sys.argv[1] == "--phase" and sys.argv[2] in phases:
            phases[sys.argv[2]](os.environ)
        else:
            raise ValueError("Backup configuration validation phase is invalid")
    except ValueError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
    print("Backup configuration gate passed; durable storage and independent decrypt still require verification.")
