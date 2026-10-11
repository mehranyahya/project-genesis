"""Offline catalog-media backup tooling. Never connects to or writes a service.

Original keys and inventory stay inside private files and the encrypted archive.
This does not prove a write freeze, a live download, or a managed Storage restore.
"""
import argparse
import contextlib
import datetime
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
import zipfile

INVENTORY_FORMAT = "genesis-storage-inventory-v1"
ARCHIVE_FORMAT = "genesis-storage-backup-v1"
MIMES = {"image/jpeg", "image/png", "image/webp", "image/avif"}
MAX_OBJECT = 20 * 1024 * 1024
MAX_TOTAL = 1024 * 1024 * 1024
MAX_MANIFEST = 8 * 1024 * 1024
MAX_OBJECTS = 10000
CHUNK = 1024 * 1024
OBJECT_FIELDS = {"id", "name", "size", "content_type", "etag", "version", "updated_at"}
UUID = r"[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}"


def require(condition):
    if not condition:
        raise ValueError("Storage backup contract failed")


def clean_text(value, limit):
    return (isinstance(value, str) and 0 < len(value.encode("utf-8")) <= limit
            and not any(ord(c) < 32 or 127 <= ord(c) <= 159 for c in value))


def project_ref(value):
    require(isinstance(value, str) and re.fullmatch(r"[a-z]{20}", value))


def generation(value):
    require(isinstance(value, str) and re.fullmatch(r"[0-9]{8}T[0-9]{6}Z", value))
    datetime.datetime.strptime(value, "%Y%m%dT%H%M%SZ")


def unique_pairs(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result)
        result[key] = value
    return result


def parse_json(raw):
    require(len(raw) <= MAX_MANIFEST)
    return json.loads(raw.decode("utf-8", errors="strict"), object_pairs_hook=unique_pairs)


def canonical(value):
    raw = json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"),
                     allow_nan=False).encode("utf-8")
    require(len(raw) <= MAX_MANIFEST)
    return raw


def inventory(doc):
    require(isinstance(doc, dict) and set(doc) == {
        "format", "bucket", "unsupported_bucket_count", "unsupported_object_count",
        "multipart_upload_count", "objects",
    })
    require(doc["format"] == INVENTORY_FORMAT)
    for field in ("unsupported_bucket_count", "unsupported_object_count", "multipart_upload_count"):
        require(type(doc[field]) is int and doc[field] == 0)
    bucket = doc["bucket"]
    require(isinstance(bucket, dict) and set(bucket) == {
        "id", "name", "public", "file_size_limit", "allowed_mime_types",
    })
    require(bucket["id"] == bucket["name"] == "catalog-media" and bucket["public"] is False)
    require(type(bucket["file_size_limit"]) is int and bucket["file_size_limit"] == MAX_OBJECT)
    mimes = bucket["allowed_mime_types"]
    require(isinstance(mimes, list) and all(isinstance(m, str) for m in mimes)
            and len(mimes) == len(MIMES) and set(mimes) == MIMES)
    objects = doc["objects"]
    require(isinstance(objects, list) and len(objects) <= MAX_OBJECTS)
    ids, keys, total = set(), set(), 0
    for item in objects:
        require(isinstance(item, dict) and set(item) == OBJECT_FIELDS)
        require(isinstance(item["id"], str) and re.fullmatch(UUID, item["id"]))
        name = item["name"]
        require(clean_text(name, 1024) and "\\" not in name
                and all(part not in {"", ".", ".."} for part in name.split("/")))
        require(item["id"] not in ids and name not in keys)
        ids.add(item["id"])
        keys.add(name)
        require(type(item["size"]) is int and 0 < item["size"] <= MAX_OBJECT)
        require(item["content_type"] in MIMES)
        # The initial scope is complete single-part originals. Multipart/unknown
        # ETags fail closed; MD5 checks transfer identity, SHA-256 protects recovery.
        require(isinstance(item["etag"], str) and re.fullmatch(
            r'(?:[a-fA-F0-9]{32}|"[a-fA-F0-9]{32}")', item["etag"]))
        require(item["version"] is None or clean_text(item["version"], 256))
        require(clean_text(item["updated_at"], 64))
        updated = datetime.datetime.fromisoformat(item["updated_at"].replace("Z", "+00:00"))
        require(updated.utcoffset() == datetime.timedelta(0))
        total += item["size"]
        require(total <= MAX_TOTAL)
    # Database/CLI ordering is not a source change; identities, versions and keys are.
    return {**doc, "bucket": {**bucket, "allowed_mime_types": sorted(mimes)},
            "objects": sorted(objects, key=lambda item: item["id"])}


def open_regular(path):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        info = os.fstat(fd)
        require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1)
        return os.fdopen(fd, "rb")
    except BaseException:
        os.close(fd)
        raise


def read_inventory(path):
    with open_regular(path) as source:
        return inventory(parse_json(source.read(MAX_MANIFEST + 1)))


def database_digest(archive, checksum, ref, stamp):
    project_ref(ref)
    generation(stamp)
    expected_name = f"supabase-{ref}-{stamp}.tar.gz.age"
    require(Path(archive).name == expected_name)
    with open_regular(archive) as source:
        return ciphertext_digest(source, checksum, expected_name, 2 * MAX_TOTAL + 64 * CHUNK)


def ciphertext_digest(source, checksum, expected_name, limit):
    with open_regular(checksum) as sidecar:
        raw = sidecar.read(1024)
        require(sidecar.read(1) == b"")
    match = re.fullmatch(rb"([a-f0-9]{64})  " + re.escape(expected_name.encode()) + rb"\n", raw)
    require(match is not None)
    digest = hashlib.sha256()
    # Header is a format check, not a proof of decryptability or age authentication.
    source.seek(0)
    require(source.read(22) == b"age-encryption.org/v1\n")
    source.seek(0)
    total = 0
    while chunk := source.read(CHUNK):
        total += len(chunk)
        require(total <= limit)
        digest.update(chunk)
    require(digest.hexdigest() == match[1].decode("ascii"))
    source.seek(0)
    return digest.hexdigest()


def private_parent(path):
    result = Path(path).absolute()
    info = result.parent.lstat()
    require(stat.S_ISDIR(info.st_mode) and info.st_uid == os.getuid()
            and info.st_mode & 0o077 == 0)
    return result


def new_file(path):
    path = private_parent(path)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    return os.fdopen(fd, "wb")


def input_keys(root):
    info = Path(root).lstat()
    require(stat.S_ISDIR(info.st_mode) and info.st_uid == os.getuid()
            and info.st_mode & 0o077 == 0)
    keys = set()
    for directory, dirs, files in os.walk(root, followlinks=False):
        for name in dirs:
            require(stat.S_ISDIR(Path(directory, name).lstat().st_mode))
        for name in files:
            child = Path(directory, name)
            info = child.lstat()
            require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1)
            keys.add(child.relative_to(root).as_posix())
            require(len(keys) <= MAX_OBJECTS)
    return keys


@contextlib.contextmanager
def source_object(root, key):
    # Open every directory by descriptor: a symlink cannot escape the export root.
    fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        parts = key.split("/")
        for part in parts[:-1]:
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = child
        child = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=fd)
        with os.fdopen(child, "rb") as stream:
            info = os.fstat(stream.fileno())
            require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1)
            yield stream
    finally:
        os.close(fd)


def zip_info(name):
    entry = zipfile.ZipInfo(name)
    entry.create_system = 3
    entry.external_attr = (stat.S_IFREG | 0o600) << 16
    entry.compress_type = zipfile.ZIP_STORED
    return entry


def pack(args):
    project_ref(args.source_project_ref)
    generation(args.generation)
    require(args.writers_paused)
    before, after = read_inventory(args.before), read_inventory(args.after)
    require(before == after)
    require(input_keys(args.files) == {item["name"] for item in before["objects"]})
    db_digest = database_digest(args.database_archive, args.database_checksum,
                                args.source_project_ref, args.generation)
    doc = {"format": ARCHIVE_FORMAT, "source_project_ref": args.source_project_ref,
           "generation": args.generation, "database_archive_sha256": db_digest,
           "inventory": before, "source_writers_paused_attestation": True, "files": []}
    output = new_file(args.output)
    try:
        with output, zipfile.ZipFile(output, "w", allowZip64=False) as archive:
            for item in before["objects"]:
                member = f"objects/{item['id']}.bin"
                digest, etag, count = hashlib.sha256(), hashlib.md5(usedforsecurity=False), 0
                with source_object(args.files, item["name"]) as source:
                    initial = os.fstat(source.fileno())
                    require(initial.st_size == item["size"])
                    with archive.open(zip_info(member), "w") as target:
                        while chunk := source.read(CHUNK):
                            count += len(chunk)
                            require(count <= item["size"])
                            target.write(chunk)
                            digest.update(chunk)
                            etag.update(chunk)
                    final = os.fstat(source.fileno())
                    require((initial.st_size, initial.st_mtime_ns, initial.st_ctime_ns) ==
                            (final.st_size, final.st_mtime_ns, final.st_ctime_ns))
                require(count == item["size"])
                require(etag.hexdigest() == item["etag"].strip('"').lower())
                doc["files"].append({"id": item["id"], "member": member,
                                     "sha256": digest.hexdigest()})
            archive.writestr(zip_info("MANIFEST.json"), canonical(doc))
        # Reread both inputs after packing; an observed inventory change invalidates it.
        require(read_inventory(args.before) == before and read_inventory(args.after) == before)
        require(input_keys(args.files) == {item["name"] for item in before["objects"]})
        verify(args.output)
    except BaseException:
        Path(args.output).unlink(missing_ok=True)
        raise


def archive_manifest(raw):
    doc = parse_json(raw)
    require(isinstance(doc, dict) and set(doc) == {
        "format", "source_project_ref", "generation", "database_archive_sha256",
        "inventory", "source_writers_paused_attestation", "files",
    })
    require(doc["format"] == ARCHIVE_FORMAT and doc["source_writers_paused_attestation"] is True)
    project_ref(doc["source_project_ref"])
    generation(doc["generation"])
    require(isinstance(doc["database_archive_sha256"], str)
            and re.fullmatch(r"[a-f0-9]{64}", doc["database_archive_sha256"]))
    inv = inventory(doc["inventory"])
    require(inv == doc["inventory"])
    require(isinstance(doc["files"], list) and len(doc["files"]) == len(inv["objects"]))
    ids = set()
    for entry in doc["files"]:
        require(isinstance(entry, dict) and set(entry) == {"id", "member", "sha256"})
        require(isinstance(entry["id"], str) and re.fullmatch(UUID, entry["id"]))
        require(entry["id"] not in ids and entry["member"] == f"objects/{entry['id']}.bin")
        require(isinstance(entry["sha256"], str) and re.fullmatch(r"[a-f0-9]{64}", entry["sha256"]))
        ids.add(entry["id"])
    require(ids == {item["id"] for item in inv["objects"]})
    return doc


def verify(path, destination=None, expected=None):
    with open_regular(path) as raw:
        # Bound the central directory before ZipFile allocates its member list.
        length = os.fstat(raw.fileno()).st_size
        require(22 <= length <= MAX_TOTAL + MAX_MANIFEST + 5 * CHUNK)
        raw.seek(-22, os.SEEK_END)
        signature, disk, start_disk, disk_count, count, central_size, offset, comment = struct.unpack(
            "<4s4H2LH", raw.read(22))
        require(signature == b"PK\x05\x06" and disk == start_disk == comment == 0
                and disk_count == count and 0 < count <= MAX_OBJECTS + 1
                and central_size <= 3 * CHUNK and offset + central_size == length - 22)
        raw.seek(0)
        with zipfile.ZipFile(raw) as archive:
            return verify_members(archive, destination, expected)


def verify_members(archive, destination, expected):
    entries = archive.infolist()
    require(len(entries) <= MAX_OBJECTS + 1 and not archive.comment)
    names, total = set(), 0
    for entry in entries:
        require(entry.filename == entry.orig_filename and entry.filename not in names
                and not entry.extra and not entry.comment)
        names.add(entry.filename)
        require(entry.create_system == 3 and stat.S_ISREG(entry.external_attr >> 16)
                and entry.compress_type == zipfile.ZIP_STORED
                and entry.flag_bits & ~(0x800 | 0x08) == 0
                and entry.compress_size == entry.file_size)
        limit = MAX_MANIFEST if entry.filename == "MANIFEST.json" else MAX_OBJECT
        require(0 < entry.file_size <= limit)
        total += entry.file_size
        require(total <= MAX_TOTAL + MAX_MANIFEST)
        require(entry.filename == "MANIFEST.json" or
                re.fullmatch(r"objects/" + UUID + r"\.bin", entry.filename))
    require("MANIFEST.json" in names)
    with archive.open("MANIFEST.json") as source:
        doc = archive_manifest(source.read(MAX_MANIFEST + 1))
    if expected is not None:
        require(doc == expected)
    items = {item["id"]: item for item in doc["inventory"]["objects"]}
    require(names == {entry["member"] for entry in doc["files"]} | {"MANIFEST.json"})
    for entry in doc["files"]:
        item = items[entry["id"]]
        require(archive.getinfo(entry["member"]).file_size == item["size"])
        digest, etag, count = hashlib.sha256(), hashlib.md5(usedforsecurity=False), 0
        target = new_file(Path(destination) / entry["member"]) if destination else contextlib.nullcontext()
        with target as output, archive.open(entry["member"]) as source:
            while chunk := source.read(CHUNK):
                count += len(chunk)
                require(count <= item["size"])
                digest.update(chunk)
                etag.update(chunk)
                if output is not None:
                    output.write(chunk)
        require(count == item["size"] and digest.hexdigest() == entry["sha256"])
        require(etag.hexdigest() == item["etag"].strip('"').lower())
    return doc


def recover(args):
    doc = verify(args.archive)
    project_ref(args.source_project_ref)
    project_ref(args.target_project_ref)
    require(doc["source_project_ref"] == args.source_project_ref
            and args.target_project_ref != args.source_project_ref)
    require(database_digest(args.database_archive, args.database_checksum,
                            args.source_project_ref, doc["generation"]) == doc["database_archive_sha256"])
    target = private_parent(args.output)
    target.mkdir(mode=0o700)  # Exclusive reservation: never overwrite an existing directory.
    try:
        (target / "objects").mkdir(mode=0o700)
        verify(args.archive, target, doc)
        with new_file(target / "MANIFEST.json") as output:
            output.write(canonical(doc))
        # Completion marker is written last. This is an offline plan, not an upload.
        plan = {"format": "genesis-storage-recovery-plan-v1", "generation": doc["generation"],
                "source_project_ref": args.source_project_ref, "target_project_ref": args.target_project_ref,
                "database_archive_sha256": doc["database_archive_sha256"],
                "live_target_verified": False, "live_restore_performed": False,
                "upload_mode": "create-only", "upsert": False,
                "bucket": doc["inventory"]["bucket"], "objects": doc["inventory"]["objects"]}
        with new_file(target / "RECOVERY_COMPLETE.json") as output:
            output.write(canonical(plan))
    except BaseException:
        shutil.rmtree(target)
        raise


def encrypt(args):
    doc = verify(args.archive)
    recipient = os.environ.get("BACKUP_ENCRYPTION_RECIPIENT", "")
    require(re.fullmatch(r"age1[ac-hj-np-z02-9]{58}", recipient) is not None)
    require(shutil.which("age") is not None)
    target = private_parent(args.output)
    require(target.name == f"storage-{doc['source_project_ref']}-{doc['generation']}.zip.age")
    sidecar = Path(str(target) + ".sha256")
    owned = []
    try:
        with contextlib.ExitStack() as stack:
            output = stack.enter_context(new_file(target))
            owned.append(target)
            checksum = stack.enter_context(new_file(sidecar))
            owned.append(sidecar)
            with open_regular(args.archive) as source:
                initial = os.fstat(source.fileno())
                result = subprocess.run(["age", "--encrypt", "--recipient", recipient], stdin=source,
                                        stdout=output, stderr=subprocess.DEVNULL, timeout=600, check=False)
                final = os.fstat(source.fileno())
                require((initial.st_size, initial.st_mtime_ns, initial.st_ctime_ns) ==
                        (final.st_size, final.st_mtime_ns, final.st_ctime_ns))
            require(result.returncode == 0 and verify(args.archive) == doc)
            output.flush()
            digest = hashlib.sha256()
            with open_regular(target) as source:
                require(source.read(22) == b"age-encryption.org/v1\n")
                source.seek(0)
                while chunk := source.read(CHUNK):
                    require(source.tell() <= MAX_TOTAL + MAX_MANIFEST + 64 * CHUNK)
                    digest.update(chunk)
            checksum.write(f"{digest.hexdigest()}  {target.name}\n".encode("ascii"))
    except BaseException:
        for path in owned:
            path.unlink(missing_ok=True)
        raise


def decrypt(args):
    # Native unencrypted X25519 identities only: no interactive prompts or plugins.
    # The private key is passed by inherited descriptor, never copied or logged.
    require(shutil.which("age") is not None)
    name = Path(args.archive).name
    match = re.fullmatch(r"storage-([a-z]{20})-([0-9]{8}T[0-9]{6}Z)\.zip\.age", name)
    require(match is not None)
    ref, stamp = match.groups()
    generation(stamp)
    target = private_parent(args.output)
    identity_path = private_parent(args.identity)
    owned = False
    try:
        with open_regular(args.archive) as source, open_regular(identity_path) as identity:
            info = os.fstat(identity.fileno())
            require(info.st_uid == os.getuid() and info.st_mode & 0o077 == 0)
            key_lines = [line for line in identity.read(4097).decode("ascii").splitlines()
                         if line and not line.startswith("#")]
            require(info.st_size <= 4096 and len(key_lines) == 1
                    and re.fullmatch(r"AGE-SECRET-KEY-1[AC-HJ-NP-Z02-9]{58}", key_lines[0]))
            identity.seek(0)
            initial = os.fstat(source.fileno())
            ciphertext_digest(source, args.checksum, name, MAX_TOTAL + MAX_MANIFEST + 64 * CHUNK)
            with new_file(target) as output:
                owned = True
                result = subprocess.run(
                    ["age", "--decrypt", "--identity", f"/proc/self/fd/{identity.fileno()}"],
                    stdin=source, stdout=output, stderr=subprocess.DEVNULL,
                    pass_fds=(identity.fileno(),), timeout=600, check=False,
                )
                final, final_key = os.fstat(source.fileno()), os.fstat(identity.fileno())
                require(result.returncode == 0)
                require((initial.st_size, initial.st_mtime_ns, initial.st_ctime_ns) ==
                        (final.st_size, final.st_mtime_ns, final.st_ctime_ns))
                require((info.st_size, info.st_mtime_ns, info.st_ctime_ns) ==
                        (final_key.st_size, final_key.st_mtime_ns, final_key.st_ctime_ns))
                ciphertext_digest(source, args.checksum, name, MAX_TOTAL + MAX_MANIFEST + 64 * CHUNK)
                output.flush()
                doc = verify(target)
                require(doc["source_project_ref"] == ref and doc["generation"] == stamp)
    except BaseException:
        # age can emit authenticated partial plaintext before a late payload error.
        # Retain no incomplete ZIP, including after timeout or manifest rejection.
        if owned:
            target.unlink(missing_ok=True)
        raise


class SafeParser(argparse.ArgumentParser):
    def error(self, message):
        raise ValueError("Invalid storage backup command")


def main():
    parser = SafeParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    make = sub.add_parser("pack")
    for name in ("before", "after", "files", "output", "source-project-ref", "generation",
                 "database-archive", "database-checksum"):
        make.add_argument("--" + name, required=True)
    make.add_argument("--writers-paused", action="store_true", required=True)
    check = sub.add_parser("verify")
    check.add_argument("archive")
    restore = sub.add_parser("recover")
    restore.add_argument("archive")
    for name in ("output", "source-project-ref", "target-project-ref", "database-archive", "database-checksum"):
        restore.add_argument("--" + name, required=True)
    seal = sub.add_parser("encrypt")
    seal.add_argument("archive")
    seal.add_argument("--output", required=True)
    unseal = sub.add_parser("decrypt")
    unseal.add_argument("archive")
    for name in ("checksum", "identity", "output"):
        unseal.add_argument("--" + name, required=True)
    args = parser.parse_args()
    {"pack": pack, "verify": lambda a: verify(a.archive), "recover": recover,
     "encrypt": encrypt, "decrypt": decrypt}[args.command](args)
    print("Storage backup operation passed (offline scope only)")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        # No file paths, original keys, parser detail, URLs, or credentials in logs.
        print("Storage backup operation failed", file=sys.stderr)
        sys.exit(1)
