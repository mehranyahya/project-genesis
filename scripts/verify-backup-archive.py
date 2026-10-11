"""Verify a decrypted backup without extracting or printing private contents.

Usage: python3 scripts/verify-backup-archive.py /private/backup.tar.gz
This checks archive integrity, not age identity availability or database restore.
"""
import hashlib
import re
import sys
import tarfile

EXPECTED = {
    "roles.sql", "schema.sql", "data.sql", "drill_schema.sql", "drill_data.sql",
    "history_schema.sql", "history_data.sql", "METADATA.json", "MANAGED_PREFLIGHT.json",
}
MAX_FILE = 1024 * 1024 * 1024
MAX_TOTAL = 2 * MAX_FILE


def verify(path):
    hashes = {}
    manifest = None
    root = None
    total = 0
    seen = set()
    # Streaming mode prevents arbitrary extraction, path traversal and buffering SQL.
    with tarfile.open(path, "r|gz") as archive:
        for member in archive:
            parts = member.name.rstrip("/").split("/")
            if not parts or not re.fullmatch(r"[0-9]{8}T[0-9]{6}Z", parts[0]):
                raise ValueError("Invalid archive layout")
            if root is None:
                root = parts[0]
            if parts[0] != root or member.name in seen or len(seen) >= 11:
                raise ValueError("Invalid archive layout")
            seen.add(member.name)
            if member.isdir() and len(parts) == 1:
                continue
            if not member.isfile() or len(parts) != 2 or parts[1] not in EXPECTED | {"SHA256SUMS"}:
                raise ValueError("Invalid archive layout")
            name = parts[1]
            if member.size < 0 or member.size > MAX_FILE or total + member.size > MAX_TOTAL:
                raise ValueError("Archive exceeds the reviewed recovery budget")
            total += member.size
            stream = archive.extractfile(member)
            if stream is None:
                raise ValueError("Archive member is unreadable")
            if name == "SHA256SUMS":
                if member.size > 8192 or manifest is not None:
                    raise ValueError("Invalid checksum manifest")
                manifest = stream.read().decode("ascii", errors="strict")
            else:
                if name in hashes:
                    raise ValueError("Duplicate archive member")
                digest = hashlib.sha256()
                count = 0
                while chunk := stream.read(1024 * 1024):
                    count += len(chunk)
                    digest.update(chunk)
                if count != member.size:
                    raise ValueError("Truncated archive member")
                hashes[name] = digest.hexdigest()
            stream.close()
    if manifest is None or set(hashes) != EXPECTED:
        raise ValueError("Incomplete backup archive")
    expected = {}
    for line in manifest.splitlines():
        match = re.fullmatch(r"([a-f0-9]{64})  ([A-Za-z0-9_.]+)", line)
        if match is None or match[2] not in EXPECTED or match[2] in expected:
            raise ValueError("Invalid checksum manifest")
        expected[match[2]] = match[1]
    if expected != hashes:
        raise ValueError("Backup integrity mismatch")


if __name__ == "__main__":
    try:
        if len(sys.argv) != 2:
            raise ValueError("Expected one private archive path")
        verify(sys.argv[1])
    except Exception:
        # Neither paths nor SQL/parser error details belong in logs.
        print("Backup archive integrity check failed", file=sys.stderr)
        sys.exit(1)
    print("Backup archive layout and all internal checksums passed")
