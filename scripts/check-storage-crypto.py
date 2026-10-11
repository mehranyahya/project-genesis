"""Mandatory real-age integration checks; synthetic bytes and ephemeral keys only.

No service connections, production configuration, logs of key material, or uploads.
Missing age/age-keygen is a failure, never a skipped or successful verification.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import struct
import subprocess
import sys
import tempfile
import zipfile
import zlib

SCRIPT = Path(__file__).resolve().with_name("storage-backup.py")
SOURCE = "p" * 20
TARGET = "t" * 20
STAMP = "20261011T120000Z"
OBJECT_ID = "11111111-1111-4111-8111-111111111111"
KEY = "تصاویر/سنگ آزمایشی.png"


def check(condition):
    if not condition:
        raise ValueError("Synthetic crypto verification failed")


def run(args, data=None, recipient=None):
    env = {"PATH": os.environ.get("PATH", ""), "PYTHONDONTWRITEBYTECODE": "1"}
    if recipient is not None:
        env["BACKUP_ENCRYPTION_RECIPIENT"] = recipient
    # stdout/stderr may contain a generated identity or authenticated partial data.
    # They stay in memory; never include subprocess output in a failure message.
    return subprocess.run(args, input=data, capture_output=True, timeout=30, env=env)


def succeeded(result):
    check(result.returncode == 0)


def private_write(file, data):
    with file.open("xb") as output:
        os.chmod(file, 0o600)
        output.write(data)


def image_bytes():
    # Real synthetic PNG, > 128 KiB: late corruption must exercise multiple chunks.
    def chunk(kind, data):
        return (struct.pack(">I", len(data)) + kind + data
                + struct.pack(">I", zlib.crc32(kind + data)))
    pixels = b"".join(b"\x00" + bytes((x + y) % 256 for x in range(256 * 3))
                      for y in range(256))
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">2I5B", 256, 256, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(pixels, 0)) + chunk(b"IEND", b""))


def keypair(root, name):
    identity = root / name
    succeeded(run(["age-keygen", "--output", str(identity)]))
    os.chmod(identity, 0o600)
    public = run(["age-keygen", "-y", str(identity)])
    succeeded(public)
    recipient = public.stdout.decode("ascii").strip()
    check(re.fullmatch(r"age1[ac-hj-np-z02-9]{58}", recipient))
    return identity, recipient


class Fixture:
    def __init__(self, root):
        self.root = root
        self.identity, self.recipient = keypair(root, "ephemeral-identity.txt")
        self.database = root / f"supabase-{SOURCE}-{STAMP}.tar.gz.age"
        self.db_plain = b"synthetic-database-generation; not a SQL dump or managed restore"
        db = run(["age", "--encrypt", "--recipient", self.recipient], self.db_plain)
        succeeded(db)
        private_write(self.database, db.stdout)
        self.sidecar(self.database)
        self.files = root / "originals"
        self.files.mkdir(mode=0o700)
        (self.files / "تصاویر").mkdir(mode=0o700)
        self.original = image_bytes()
        private_write(self.files / KEY, self.original)
        self.inventory = {
            "format": "genesis-storage-inventory-v1",
            "bucket": {"id": "catalog-media", "name": "catalog-media", "public": False,
                       "file_size_limit": 20971520,
                       "allowed_mime_types": ["image/jpeg", "image/png", "image/webp", "image/avif"]},
            "unsupported_bucket_count": 0, "unsupported_object_count": 0,
            "multipart_upload_count": 0,
            "objects": [{"id": OBJECT_ID, "name": KEY, "size": len(self.original),
                         "content_type": "image/png",
                         "etag": hashlib.md5(self.original, usedforsecurity=False).hexdigest(),
                         "version": "synthetic-version-1", "updated_at": "2026-10-11T12:00:00Z"}],
        }
        for name in ("before.json", "after.json"):
            private_write(root / name, json.dumps(self.inventory, ensure_ascii=False).encode())
        self.archive = root / "storage.zip"
        succeeded(self.tool([
            "pack", "--before", str(root / "before.json"), "--after", str(root / "after.json"),
            "--files", str(self.files), "--output", str(self.archive),
            "--source-project-ref", SOURCE, "--generation", STAMP,
            "--database-archive", str(self.database), "--database-checksum", str(self.database) + ".sha256",
            "--writers-paused",
        ]))
        self.ciphertext = root / f"storage-{SOURCE}-{STAMP}.zip.age"
        succeeded(self.tool(["encrypt", str(self.archive), "--output", str(self.ciphertext)], self.recipient))
        self.output = root / "opened.zip"

    def tool(self, args, recipient=None):
        return run([sys.executable, str(SCRIPT), *args], recipient=recipient)

    def sidecar(self, file):
        sidecar = Path(str(file) + ".sha256")
        if sidecar.exists():
            sidecar.unlink()
        digest = hashlib.sha256(file.read_bytes()).hexdigest()
        private_write(sidecar, f"{digest}  {file.name}\n".encode("ascii"))

    def decrypt(self, identity=None):
        return self.tool(["decrypt", str(self.ciphertext), "--checksum", str(self.ciphertext) + ".sha256",
                          "--identity", str(identity or self.identity), "--output", str(self.output)])

    def failure(self, identity=None):
        result = self.decrypt(identity)
        check(result.returncode != 0 and result.stdout == b""
              and result.stderr == b"Storage backup operation failed\n")
        check(not self.output.exists() and not self.output.is_symlink())

    def replace_ciphertext(self, data, refresh_checksum=True):
        self.ciphertext.write_bytes(data)
        if refresh_checksum:
            self.sidecar(self.ciphertext)

    def encrypt_external(self, data):
        encrypted = run(["age", "--encrypt", "--recipient", self.recipient], data)
        succeeded(encrypted)
        self.replace_ciphertext(encrypted.stdout)


def roundtrip(f):
    check(len(f.original) > 128 * 1024)
    db = run(["age", "--decrypt", "--identity", str(f.identity)], f.database.read_bytes())
    succeeded(db)
    check(db.stdout == f.db_plain)
    expected = f.archive.read_bytes()
    f.archive.unlink()
    shutil.rmtree(f.files)
    for name in ("before.json", "after.json"):
        (f.root / name).unlink()
    succeeded(f.decrypt())
    check(f.output.read_bytes() == expected and stat.S_IMODE(f.output.stat().st_mode) == 0o600)
    succeeded(f.tool(["verify", str(f.output)]))
    recovered = f.root / "recovery"
    succeeded(f.tool([
        "recover", str(f.output), "--output", str(recovered), "--source-project-ref", SOURCE,
        "--target-project-ref", TARGET, "--database-archive", str(f.database),
        "--database-checksum", str(f.database) + ".sha256",
    ]))
    original = recovered / "objects" / f"{OBJECT_ID}.bin"
    check(original.read_bytes() == f.original and stat.S_IMODE(original.stat().st_mode) == 0o600)
    check(stat.S_IMODE(recovered.stat().st_mode) == 0o700)
    plan = json.loads((recovered / "RECOVERY_COMPLETE.json").read_bytes())
    check(plan["live_target_verified"] is False and plan["live_restore_performed"] is False
          and plan["upsert"] is False and plan["objects"][0]["name"] == KEY)


def wrong_identity(f):
    other, _ = keypair(f.root, "other-ephemeral-identity.txt")
    f.failure(other)


def checksum_failure(f):
    data = bytearray(f.ciphertext.read_bytes())
    data[-1] ^= 1
    f.replace_ciphertext(data, refresh_checksum=False)
    f.failure()


def late_payload_corruption(f):
    data = bytearray(f.ciphertext.read_bytes())
    data[-1] ^= 1
    f.replace_ciphertext(data)
    # Prove that a real decoder produces a partial authenticated file here.
    # A valid sidecar alone cannot accept it; the wrapper must delete that file.
    partial = run(["age", "--decrypt", "--identity", str(f.identity)], bytes(data))
    check(partial.returncode != 0 and len(partial.stdout) > 64 * 1024)
    f.failure()


def truncated_payload(f):
    f.replace_ciphertext(f.ciphertext.read_bytes()[:-32])
    f.failure()


def invalid_plaintext(f):
    # Encryption and authentication succeed, but the recovered bytes are not our ZIP.
    f.encrypt_external(b"synthetic-authenticated-data-that-is-not-a-storage-archive")
    f.failure()


def generation_mismatch(f):
    candidate = f.root / "other-generation.zip"
    with zipfile.ZipFile(f.archive) as source, zipfile.ZipFile(candidate, "w") as target:
        for entry in source.infolist():
            data = source.read(entry)
            if entry.filename == "MANIFEST.json":
                doc = json.loads(data)
                doc["source_project_ref"] = "x" * 20
                data = json.dumps(doc, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
            target.writestr(entry, data)
    os.chmod(candidate, 0o600)
    succeeded(f.tool(["verify", str(candidate)]))
    f.encrypt_external(candidate.read_bytes())
    f.failure()


def existing_output(f):
    owner_bytes = b"synthetic-owner-work"
    private_write(f.output, owner_bytes)
    check(f.decrypt().returncode != 0 and f.output.read_bytes() == owner_bytes)
    f.output.unlink()
    owner = f.root / "owner-work"
    private_write(owner, owner_bytes)
    f.output.symlink_to(owner)
    check(f.decrypt().returncode != 0 and f.output.is_symlink() and owner.read_bytes() == owner_bytes)


def identity_access(f):
    os.chmod(f.identity, 0o640)
    f.failure()
    os.chmod(f.identity, 0o600)
    link = f.root / "identity-symlink"
    link.symlink_to(f.identity)
    f.failure(link)
    link.unlink()
    os.link(f.identity, link)
    f.failure()
    link.unlink()
    unsupported = f.root / "unsupported-identity"
    private_write(unsupported, b"AGE-PLUGIN-EXAMPLE-1synthetic\n")
    f.failure(unsupported)


CASES = [roundtrip, wrong_identity, checksum_failure, late_payload_corruption,
         truncated_payload, invalid_plaintext, generation_mismatch, existing_output, identity_access]


def main():
    check(shutil.which("age") and shutil.which("age-keygen"))
    version = run(["age", "--version"])
    key_version = run(["age-keygen", "--version"])
    succeeded(version)
    succeeded(key_version)
    decoded = version.stdout.decode("ascii").strip()
    check(re.fullmatch(r"v[0-9]+\.[0-9]+\.[0-9]+", decoded)
          and key_version.stdout.decode("ascii").strip() == decoded)
    for case in CASES:
        try:
            with tempfile.TemporaryDirectory(prefix="genesis-offline-crypto-") as directory:
                case(Fixture(Path(directory)))
        except Exception:
            print(f"Storage crypto verification failed: {case.__name__}", file=sys.stderr)
            return 1
    print(f"Storage crypto verification passed ({len(CASES)} scenarios; age {decoded}; synthetic only)")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        print("Storage crypto verification failed (trusted age and age-keygen required)", file=sys.stderr)
        sys.exit(1)
