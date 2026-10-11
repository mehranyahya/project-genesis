import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const configScript = new URL("../../scripts/backup-config.py", import.meta.url).pathname;
const archiveScript = new URL("../../scripts/verify-backup-archive.py", import.meta.url).pathname;
const readbackScript = new URL("../../scripts/verify-backup-readback.sh", import.meta.url).pathname;

function backupEnv(): Record<string, string> {
  const ref = "p".repeat(20);
  return {
    SUPABASE_PROJECT_REF: ref,
    SUPABASE_DB_SESSION_POOLER_URL: `postgresql://postgres.${ref}:synthetic-backup-only@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require`,
    BACKUP_ENCRYPTION_RECIPIENT: "age1synthetic-recipient-configuration-only",
    R2_ACCOUNT_ID: "a".repeat(32),
    R2_ACCESS_KEY_ID: "synthetic-access-only",
    R2_SECRET_ACCESS_KEY: "synthetic-secret-only",
    R2_BACKUP_BUCKET: "synthetic-backups",
    HEALTHCHECKS_BACKUP_PING_URL: "https://hc-ping.com/synthetic-ping-only",
  };
}

test("backup config requires durable storage and monitoring even if the short-lived artifact is available", () => {
  const fixture = backupEnv();
  const run = (env: Record<string, string>) =>
    spawnSync("python3", [configScript], {
      encoding: "utf8",
      env: { PATH: process.env["PATH"], ...env },
    });
  assert.equal(run(fixture).status, 0);
  for (const key of Object.keys(fixture)) {
    const result = run({ ...fixture, [key]: "" });
    assert.notEqual(result.status, 0, key);
    assert.match(result.stderr, new RegExp(key));
    assert.doesNotMatch(
      result.stderr,
      /synthetic-backup-only|synthetic-secret-only|synthetic-ping-only/,
    );
  }
});

test("backup project selection validates the username, pooler, session port and TLS rather than a substring", () => {
  const env = backupEnv();
  const url = env["SUPABASE_DB_SESSION_POOLER_URL"]!;
  for (const invalid of [
    url.replace("postgres." + "p".repeat(20), "postgres.wrong"),
    url.replace(":5432", ":6543"),
    url.replace(".pooler.supabase.com", ".example.com"),
    url.replace("sslmode=require", "sslmode=disable"),
    url.replace("?sslmode=require", ""),
    url + "&sslmode=disable",
    url + "&host=synthetic-other.example.com",
    url + "&user=postgres.wrong",
    url.replace("/postgres?", "/wrong?"),
    url + "#synthetic-private-marker",
  ]) {
    const result = spawnSync("python3", [configScript], {
      encoding: "utf8",
      env: { PATH: process.env["PATH"], ...env, SUPABASE_DB_SESSION_POOLER_URL: invalid },
    });
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stderr, /synthetic-private-marker|synthetic-backup-only|Traceback/);
  }
});

test("invalid monitor, bucket, recipient and account fail without printing private input", () => {
  for (const [key, value] of [
    ["HEALTHCHECKS_BACKUP_PING_URL", "http://localhost/synthetic-private-marker"],
    ["HEALTHCHECKS_BACKUP_PING_URL", "https://hc-ping.com/synthetic-private-marker?query=yes"],
    ["R2_ACCOUNT_ID", "synthetic-private-marker"],
    ["R2_BACKUP_BUCKET", "INVALID/synthetic-private-marker"],
    ["BACKUP_ENCRYPTION_RECIPIENT", "synthetic-private-marker"],
  ]) {
    const result = spawnSync("python3", [configScript], {
      encoding: "utf8",
      env: { PATH: process.env["PATH"], ...backupEnv(), [key!]: value! },
    });
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stderr, /synthetic-private-marker|Traceback/);
  }
});

test("durable readback catches same-size corruption and mismatched or false checksum sidecars", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "genesis-backup-readback-"));
  try {
    const local = path.join(dir, "backup.age");
    const remote = path.join(dir, "readback.age");
    const sidecar = path.join(dir, "backup.age.sha256");
    const downloadedSidecar = path.join(dir, "readback.age.sha256");
    const bytes = Buffer.from("synthetic-encrypted-generation");
    const checksum = `${createHash("sha256").update(bytes).digest("hex")}  backup.age\n`;
    const reset = () => {
      writeFileSync(local, bytes);
      writeFileSync(remote, bytes);
      writeFileSync(sidecar, checksum);
      writeFileSync(downloadedSidecar, checksum);
    };
    const run = () =>
      spawnSync("bash", [readbackScript, local, sidecar, remote, downloadedSidecar], {
        encoding: "utf8",
      });
    reset();
    assert.equal(run().status, 0);
    const corrupted = Buffer.from(bytes);
    corrupted[0] = 0;
    writeFileSync(remote, corrupted);
    assert.notEqual(run().status, 0);
    reset();
    writeFileSync(downloadedSidecar, "x".repeat(checksum.length));
    assert.notEqual(run().status, 0);
    reset();
    const falseChecksum = `${"a".repeat(64)}  backup.age\n`;
    writeFileSync(sidecar, falseChecksum);
    writeFileSync(downloadedSidecar, falseChecksum);
    assert.notEqual(run().status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const archiveWriter = String.raw`
import hashlib, io, json, sys, tarfile
mode = sys.argv[2]
root = '20261011T120000Z'
names = ['roles.sql', 'schema.sql', 'data.sql', 'drill_schema.sql', 'drill_data.sql', 'history_schema.sql', 'history_data.sql', 'METADATA.json', 'MANAGED_PREFLIGHT.json']
files = {name: b'synthetic-private-fixture' for name in names}
manifest = ''.join(hashlib.sha256(content).hexdigest() + '  ' + name + '\n' for name, content in files.items())
if mode == 'corrupt': files['data.sql'] = b'synthetic-private-CHANGED'
if mode in ['missing', 'oversize']: del files['data.sql']
if mode == 'false-manifest': manifest = manifest.replace('data.sql', '../data.sql')
with tarfile.open(sys.argv[1], 'w:gz', format=tarfile.USTAR_FORMAT) as archive:
    directory = tarfile.TarInfo(root); directory.type = tarfile.DIRTYPE; archive.addfile(directory)
    for name, content in [*files.items(), ('SHA256SUMS', manifest.encode())]:
        info = tarfile.TarInfo(root + '/' + name); info.size = len(content)
        archive.addfile(info, io.BytesIO(content))
    if mode in ['symlink', 'traversal', 'duplicate', 'extra', 'oversize']:
        name = {'symlink': root + '/link', 'traversal': '../synthetic-private-marker', 'duplicate': root + '/data.sql', 'extra': root + '/unexpected.sql', 'oversize': root + '/data.sql'}[mode]
        info = tarfile.TarInfo(name)
        if mode == 'symlink': info.type = tarfile.SYMTYPE; info.linkname = '/synthetic-private-marker'
        if mode == 'oversize': info.size = 1024 * 1024 * 1024 + 1
        archive.addfile(info)
`;

test("decrypted archive validator streams the exact complete logical backup and internal checksums", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "genesis-backup-archive-"));
  try {
    const archive = path.join(dir, "backup.tar.gz");
    const fixture = spawnSync("python3", ["-c", archiveWriter, archive, "valid"], {
      encoding: "utf8",
    });
    assert.equal(fixture.status, 0, fixture.stderr);
    const result = spawnSync("python3", [archiveScript, archive], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /all internal checksums passed/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("decrypted archive rejects missing, corrupt, duplicate, extra, linked, traversing and oversized members", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "genesis-backup-invalid-"));
  try {
    for (const mode of [
      "corrupt",
      "missing",
      "false-manifest",
      "symlink",
      "traversal",
      "duplicate",
      "extra",
      "oversize",
    ]) {
      const archive = path.join(dir, "backup.tar.gz");
      const fixture = spawnSync("python3", ["-c", archiveWriter, archive, mode], {
        encoding: "utf8",
      });
      assert.equal(fixture.status, 0, fixture.stderr);
      const result = spawnSync("python3", [archiveScript, archive], { encoding: "utf8" });
      assert.notEqual(result.status, 0, mode);
      assert.equal(result.stderr.trim(), "Backup archive integrity check failed");
      assert.doesNotMatch(result.stderr, /synthetic-private|Traceback/);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("workflow requires durable configuration before dump, validates the archive and verifies downloaded encrypted bytes", () => {
  const workflow = readFileSync(
    new URL("../../.github/workflows/backup-supabase.yml", import.meta.url),
    "utf8",
  );
  assert.ok(
    workflow.indexOf("python3 scripts/backup-config.py") < workflow.indexOf("supabase db dump"),
  );
  assert.ok(
    workflow.indexOf("python3 scripts/verify-backup-archive.py") <
      workflow.indexOf("age --encrypt"),
  );
  assert.match(workflow, /bash scripts\/verify-backup-readback\.sh/);
  assert.doesNotMatch(workflow, /r2_enabled|only the encrypted 7-day/);
  const archive = readFileSync(
    new URL("../../scripts/verify-backup-archive.py", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(archive, /extractall|\.extract\(/);
});
