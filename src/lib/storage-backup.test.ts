import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const script = new URL("../../scripts/storage-backup.py", import.meta.url).pathname;
const python = spawnSync("python3", ["-c", "import sys; print(sys.executable)"], {
  encoding: "utf8",
}).stdout.trim();
const sourceRef = "p".repeat(20);
const targetRef = "t".repeat(20);
const stamp = "20261011T120000Z";
const objectId = "11111111-1111-4111-8111-111111111111";
const originalKey = "تصاویر/سنگ آزمایشی.jpg";
const original = Buffer.from("synthetic-original-stone-photo-fixture");

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "genesis-storage-backup-"));
  const files = path.join(root, "originals");
  mkdirSync(files, { mode: 0o700 });
  mkdirSync(path.join(files, "تصاویر"), { mode: 0o700 });
  writeFileSync(path.join(files, originalKey), original, { mode: 0o600 });
  const inventory = {
    format: "genesis-storage-inventory-v1",
    bucket: {
      id: "catalog-media",
      name: "catalog-media",
      public: false,
      file_size_limit: 20971520,
      allowed_mime_types: ["image/jpeg", "image/png", "image/webp", "image/avif"],
    },
    unsupported_bucket_count: 0,
    unsupported_object_count: 0,
    multipart_upload_count: 0,
    objects: [
      {
        id: objectId,
        name: originalKey,
        size: original.length,
        content_type: "image/jpeg",
        etag: createHash("md5").update(original).digest("hex"),
        version: "synthetic-version-1",
        updated_at: "2026-10-11T12:00:00.000000Z",
      },
    ],
  };
  const before = path.join(root, "before.json");
  const after = path.join(root, "after.json");
  const writeInventory = (value = inventory) => {
    for (const file of [before, after]) writeFileSync(file, JSON.stringify(value), { mode: 0o600 });
  };
  writeInventory();
  // Format/digest fixture only: these bytes are not a real encrypted backup.
  const database = path.join(root, `supabase-${sourceRef}-${stamp}.tar.gz.age`);
  const dbBytes = Buffer.from("age-encryption.org/v1\nsynthetic-ciphertext-header-fixture");
  writeFileSync(database, dbBytes, { mode: 0o600 });
  const checksum = database + ".sha256";
  writeFileSync(
    checksum,
    `${createHash("sha256").update(dbBytes).digest("hex")}  ${path.basename(database)}\n`,
    { mode: 0o600 },
  );
  const archive = path.join(root, "storage.zip");
  const run = (args: string[], extraEnv: Record<string, string> = {}) =>
    spawnSync(python, [script, ...args], {
      encoding: "utf8",
      env: { PATH: process.env["PATH"], PYTHONDONTWRITEBYTECODE: "1", ...extraEnv },
    });
  const packArgs = [
    "pack",
    "--before",
    before,
    "--after",
    after,
    "--files",
    files,
    "--output",
    archive,
    "--source-project-ref",
    sourceRef,
    "--generation",
    stamp,
    "--database-archive",
    database,
    "--database-checksum",
    checksum,
    "--writers-paused",
  ];
  const recoverArgs = [
    "recover",
    archive,
    "--output",
    path.join(root, "recovery"),
    "--source-project-ref",
    sourceRef,
    "--target-project-ref",
    targetRef,
    "--database-archive",
    database,
    "--database-checksum",
    checksum,
  ];
  const pack = () => {
    const result = run(packArgs);
    assert.equal(result.status, 0, result.stderr);
  };
  return {
    root,
    files,
    inventory,
    before,
    after,
    writeInventory,
    database,
    checksum,
    archive,
    run,
    packArgs,
    recoverArgs,
    pack,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

function failed(result: ReturnType<typeof spawnSync>) {
  assert.notEqual(result.status, 0);
  assert.equal(String(result.stderr).trim(), "Storage backup operation failed");
  assert.equal(String(result.stdout).trim(), "");
  assert.doesNotMatch(String(result.stderr), /synthetic-|سنگ|تصاویر|Traceback/);
}

const mutateArchive = String.raw`
import io, json, stat, struct, sys, zipfile
file, mode = sys.argv[1:]
with zipfile.ZipFile(file) as source:
    entries = [(entry.filename, source.read(entry)) for entry in source.infolist()]
manifest = json.loads(dict(entries)['MANIFEST.json'])
member = manifest['files'][0]['member']
if mode == 'false-sha': manifest['files'][0]['sha256'] = '0' * 64
if mode == 'duplicate-id': manifest['files'].append(manifest['files'][0])
if mode == 'boolean-size': manifest['inventory']['objects'][0]['size'] = True
if mode == 'unsafe-key': manifest['inventory']['objects'][0]['name'] = '../synthetic-private-marker'
if mode == 'unknown-etag': manifest['inventory']['objects'][0]['etag'] = 'unknown-multipart-2'
if mode in ['false-sha', 'duplicate-id', 'boolean-size', 'unsafe-key', 'unknown-etag']:
    entries = [(name, json.dumps(manifest).encode() if name == 'MANIFEST.json' else data) for name, data in entries]
if mode == 'corrupt': entries = [(name, b'X' + data[1:] if name == member else data) for name, data in entries]
if mode == 'missing': entries = [(name, data) for name, data in entries if name != member]
if mode == 'duplicate': entries.append(entries[0])
if mode in ['extra', 'traversal', 'absolute', 'symlink', 'directory', 'fifo', 'backslash']:
    names = {'extra': 'objects/22222222-2222-4222-8222-222222222222.bin', 'traversal': '../synthetic-private-marker',
             'absolute': '/synthetic-private-marker', 'backslash': r'objects\synthetic-private-marker'}
    entries.append((names.get(mode, 'objects/33333333-3333-4333-8333-333333333333.bin'), b'synthetic-extra'))
if mode == 'duplicate-json': entries = [(name, data.replace(b'{', b'{"format":"duplicate",', 1) if name == 'MANIFEST.json' else data) for name, data in entries]
with zipfile.ZipFile(file, 'w') as target:
    for index, (name, data) in enumerate(entries):
        entry = zipfile.ZipInfo(name); entry.create_system = 3
        kind = stat.S_IFREG
        if index == len(entries) - 1:
            kind = {'symlink': stat.S_IFLNK, 'directory': stat.S_IFDIR, 'fifo': stat.S_IFIFO}.get(mode, kind)
        entry.external_attr = (kind | 0o600) << 16
        entry.compress_type = zipfile.ZIP_DEFLATED if mode == 'compressed' else zipfile.ZIP_STORED
        if mode == 'extra-metadata': entry.extra = b'\x01\x00\x00\x00'
        target.writestr(entry, data)
if mode in ['oversize', 'manifest-oversize', 'encrypted-flag']:
    data = bytearray(open(file, 'rb').read()); start = data.index(b'PK\x01\x02')
    if mode == 'manifest-oversize': start = data.index(b'PK\x01\x02', start + 4)
    if mode == 'encrypted-flag': struct.pack_into('<H', data, start + 8, 1)
    else:
        size = 8 * 1024 * 1024 + 1 if mode == 'manifest-oversize' else 20 * 1024 * 1024 + 1
        struct.pack_into('<I', data, start + 20, size); struct.pack_into('<I', data, start + 24, size)
    open(file, 'wb').write(data)
if mode == 'truncated':
    data = open(file, 'rb').read(); open(file, 'wb').write(data[:-20])
`;

function mutate(file: string, mode: string) {
  const result = spawnSync(python, ["-c", mutateArchive, file, mode], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}

test("an explicitly empty private bucket is a valid empty inventory without fabricated files", () => {
  const f = fixture();
  try {
    f.inventory.objects = [];
    f.writeInventory();
    rmSync(path.join(f.files, "تصاویر"), { recursive: true });
    f.pack();
    assert.equal(f.run(["verify", f.archive]).status, 0);
    assert.equal(f.run(f.recoverArgs).status, 0);
    const plan = JSON.parse(
      readFileSync(path.join(f.root, "recovery", "RECOVERY_COMPLETE.json"), "utf8"),
    );
    assert.deepEqual(plan.objects, []);
  } finally {
    f.cleanup();
  }
});

test("original Storage bytes, Unicode keys and the database generation survive offline recovery", () => {
  const f = fixture();
  try {
    f.pack();
    assert.equal(f.run(["verify", f.archive]).status, 0);
    const result = f.run(f.recoverArgs);
    assert.equal(result.status, 0, result.stderr);
    const recovery = path.join(f.root, "recovery");
    assert.deepEqual(readFileSync(path.join(recovery, "objects", objectId + ".bin")), original);
    const plan = JSON.parse(readFileSync(path.join(recovery, "RECOVERY_COMPLETE.json"), "utf8"));
    assert.equal(plan.objects[0].name, originalKey);
    assert.equal(plan.target_project_ref, targetRef);
    assert.equal(plan.live_target_verified, false);
    assert.equal(plan.live_restore_performed, false);
    assert.equal(plan.upsert, false);
    assert.equal(plan.upload_mode, "create-only");
  } finally {
    f.cleanup();
  }
});

test("packing binds the actual database ciphertext bytes and refuses a false checksum", () => {
  const f = fixture();
  try {
    writeFileSync(f.database, "age-encryption.org/v1\nsynthetic-wrong-ciphertext");
    failed(f.run(f.packArgs));
    assert.equal(existsSync(f.archive), false);
  } finally {
    f.cleanup();
  }
});

test("source changes across before/after inventories and an absent write-freeze attestation fail", () => {
  const f = fixture();
  try {
    failed(f.run(f.packArgs.slice(0, -1)));
    for (const change of [
      { version: "synthetic-version-2" },
      { updated_at: "2026-10-11T12:01:00Z" },
      { name: "renamed.jpg" },
    ]) {
      const changed = structuredClone(f.inventory);
      Object.assign(changed.objects[0]!, change);
      writeFileSync(f.after, JSON.stringify(changed));
      failed(f.run(f.packArgs));
      assert.equal(existsSync(f.archive), false);
    }
  } finally {
    f.cleanup();
  }
});

test("public/foreign buckets, foreign objects, multipart transfers and invalid MIME cannot enter the initial scope", () => {
  const f = fixture();
  try {
    for (const mode of [
      "public",
      "bucket",
      "foreign-bucket",
      "foreign-object",
      "multipart",
      "mime",
      "etag",
    ]) {
      const changed = structuredClone(f.inventory);
      if (mode === "public") changed.bucket.public = true;
      if (mode === "bucket") changed.bucket.id = "synthetic-other";
      if (mode === "foreign-bucket") changed.unsupported_bucket_count = 1;
      if (mode === "foreign-object") changed.unsupported_object_count = 1;
      if (mode === "multipart") changed.multipart_upload_count = 1;
      if (mode === "mime") changed.objects[0]!.content_type = "image/svg+xml";
      if (mode === "etag") changed.objects[0]!.etag = "synthetic-multipart-2";
      f.writeInventory(changed);
      failed(f.run(f.packArgs));
      assert.equal(existsSync(f.archive), false);
    }
  } finally {
    f.cleanup();
  }
});

test("duplicate identities and unsafe original keys are rejected before reading originals", () => {
  const f = fixture();
  try {
    for (const name of [
      "../synthetic-private-marker",
      "/synthetic-private-marker",
      "a//b",
      "a/./b",
      "a\\b",
      "a\nb",
    ]) {
      const changed = structuredClone(f.inventory);
      changed.objects[0]!.name = name;
      f.writeInventory(changed);
      failed(f.run(f.packArgs));
    }
    const duplicate = structuredClone(f.inventory);
    duplicate.objects.push({ ...duplicate.objects[0]! });
    f.writeInventory(duplicate);
    failed(f.run(f.packArgs));
  } finally {
    f.cleanup();
  }
});

test("original-byte export must contain every expected file and no untracked file", () => {
  const f = fixture();
  try {
    const object = path.join(f.files, originalKey);
    rmSync(object);
    failed(f.run(f.packArgs));
    writeFileSync(object, original);
    writeFileSync(path.join(f.files, "untracked.jpg"), "synthetic-extra");
    failed(f.run(f.packArgs));
    assert.equal(existsSync(f.archive), false);
  } finally {
    f.cleanup();
  }
});

test("same-size corruption and truncated originals fail against the source ETag and size", () => {
  const f = fixture();
  try {
    const changed = Buffer.from(original);
    changed[0] = 0;
    for (const bytes of [changed, original.subarray(1)]) {
      writeFileSync(path.join(f.files, originalKey), bytes);
      failed(f.run(f.packArgs));
      assert.equal(existsSync(f.archive), false);
    }
  } finally {
    f.cleanup();
  }
});

test("symlinks, directory symlinks and hard-linked originals cannot escape or alias the private export", () => {
  for (const mode of ["file", "directory", "hardlink"]) {
    const f = fixture();
    try {
      const object = path.join(f.files, originalKey);
      const outside = path.join(f.root, "synthetic-private-marker");
      writeFileSync(outside, original);
      if (mode === "directory") {
        rmSync(path.join(f.files, "تصاویر"), { recursive: true });
        symlinkSync(f.root, path.join(f.files, "تصاویر"));
      } else {
        rmSync(object);
        if (mode === "file") symlinkSync(outside, object);
        else linkSync(outside, object);
      }
      failed(f.run(f.packArgs));
      assert.deepEqual(readFileSync(outside), original);
    } finally {
      f.cleanup();
    }
  }
});

test("pack refuses a public output parent and preserves an existing output", () => {
  const f = fixture();
  try {
    chmodSync(f.root, 0o755);
    failed(f.run(f.packArgs));
    chmodSync(f.root, 0o700);
    writeFileSync(f.archive, "synthetic-owner-work");
    failed(f.run(f.packArgs));
    assert.equal(readFileSync(f.archive, "utf8"), "synthetic-owner-work");
  } finally {
    f.cleanup();
  }
});

test("archive recovery rejects corrupt, missing, extra, duplicate, truncated and false-checksum bytes", () => {
  for (const mode of [
    "corrupt",
    "missing",
    "extra",
    "duplicate",
    "false-sha",
    "truncated",
    "duplicate-id",
    "duplicate-json",
  ]) {
    const f = fixture();
    try {
      f.pack();
      mutate(f.archive, mode);
      failed(f.run(["verify", f.archive]));
      failed(f.run(f.recoverArgs));
      assert.equal(existsSync(path.join(f.root, "recovery")), false);
    } finally {
      f.cleanup();
    }
  }
});

test("archive paths, file types, unsupported metadata, compression and encrypted ZIP flags fail closed", () => {
  for (const mode of [
    "traversal",
    "absolute",
    "backslash",
    "symlink",
    "directory",
    "fifo",
    "extra-metadata",
    "compressed",
    "encrypted-flag",
    "unsafe-key",
    "boolean-size",
    "unknown-etag",
  ]) {
    const f = fixture();
    try {
      f.pack();
      mutate(f.archive, mode);
      failed(f.run(["verify", f.archive]));
    } finally {
      f.cleanup();
    }
  }
});

test("declared oversized object and manifest members are rejected without allocation or extraction", () => {
  for (const mode of ["oversize", "manifest-oversize"]) {
    const f = fixture();
    try {
      f.pack();
      mutate(f.archive, mode);
      failed(f.run(["verify", f.archive]));
    } finally {
      f.cleanup();
    }
  }
});

test("offline recovery requires a distinct target and the matching database generation", () => {
  const f = fixture();
  try {
    f.pack();
    const same = f.recoverArgs.map((value) => (value === targetRef ? sourceRef : value));
    failed(f.run(same));
    writeFileSync(f.checksum, "0".repeat(64) + "  " + path.basename(f.database) + "\n");
    failed(f.run(f.recoverArgs));
    assert.equal(existsSync(path.join(f.root, "recovery")), false);
  } finally {
    f.cleanup();
  }
});

test("recovery preserves an existing directory and cleans up a changed archive during the second pass", () => {
  const f = fixture();
  try {
    f.pack();
    const recovery = path.join(f.root, "recovery");
    mkdirSync(recovery, { mode: 0o700 });
    const owned = path.join(recovery, "owner-file");
    writeFileSync(owned, "synthetic-owner-work");
    failed(f.run(f.recoverArgs));
    assert.equal(readFileSync(owned, "utf8"), "synthetic-owner-work");
    rmSync(recovery, { recursive: true });
    const race = String.raw`
import importlib.util, pathlib, sys
spec = importlib.util.spec_from_file_location('storage_backup', sys.argv[1]); module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
real_verify = module.verify
def changed(path, destination=None, expected=None):
    if destination is not None: pathlib.Path(path).write_bytes(b'synthetic-race')
    return real_verify(path, destination, expected)
module.verify = changed
sys.argv = [sys.argv[1], *sys.argv[2:]]
try: module.main()
except Exception: print('Storage backup operation failed', file=sys.stderr); sys.exit(1)
`;
    const result = spawnSync(python, ["-c", race, script, ...f.recoverArgs], {
      encoding: "utf8",
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
    });
    failed(result);
    assert.equal(existsSync(recovery), false);
  } finally {
    f.cleanup();
  }
});

test("encryption fails before creating files when the real age executable is unavailable", () => {
  const f = fixture();
  try {
    f.pack();
    const emptyPath = path.join(f.root, "empty-bin");
    mkdirSync(emptyPath, { mode: 0o700 });
    const output = path.join(f.root, `storage-${sourceRef}-${stamp}.zip.age`);
    failed(
      f.run(["encrypt", f.archive, "--output", output], {
        PATH: emptyPath,
        BACKUP_ENCRYPTION_RECIPIENT: "age1" + "q".repeat(58),
      }),
    );
    assert.equal(existsSync(output), false);
    assert.equal(existsSync(output + ".sha256"), false);
  } finally {
    f.cleanup();
  }
});

test("failed age subprocess removes only its new outputs and suppresses private encoder errors", () => {
  const f = fixture();
  try {
    f.pack();
    const bin = path.join(f.root, "bin");
    mkdirSync(bin, { mode: 0o700 });
    writeFileSync(
      path.join(bin, "age"),
      "#!/bin/sh\nprintf 'synthetic-private-encoder-error' >&2\nprintf 'partial'\nexit 1\n",
      { mode: 0o700 },
    );
    const output = path.join(f.root, `storage-${sourceRef}-${stamp}.zip.age`);
    const env = { PATH: bin, BACKUP_ENCRYPTION_RECIPIENT: "age1" + "q".repeat(58) };
    failed(f.run(["encrypt", f.archive, "--output", output], env));
    assert.equal(existsSync(output), false);
    assert.equal(existsSync(output + ".sha256"), false);
    writeFileSync(output + ".sha256", "synthetic-owner-checksum");
    failed(f.run(["encrypt", f.archive, "--output", output], env));
    assert.equal(existsSync(output), false);
    assert.equal(readFileSync(output + ".sha256", "utf8"), "synthetic-owner-checksum");
  } finally {
    f.cleanup();
  }
});

function decryptFixture(body = "printf 'partial-plaintext'; exit 1") {
  const f = fixture();
  f.pack();
  const bin = path.join(f.root, "decrypt-bin");
  mkdirSync(bin, { mode: 0o700 });
  const marker = path.join(f.root, "decoder-called");
  writeFileSync(
    path.join(bin, "age"),
    `#!/bin/sh\nprintf 'called' > "$STORAGE_CRYPTO_TEST_MARKER"\nprintf 'synthetic-private-decoder-error' >&2\n${body}\n`,
    { mode: 0o700 },
  );
  const identity = path.join(f.root, "offline-identity");
  // Syntactic fixture only, intentionally not a real age key.
  writeFileSync(identity, "AGE-SECRET-KEY-1" + "Q".repeat(58) + "\n", { mode: 0o600 });
  const ciphertext = path.join(f.root, `storage-${sourceRef}-${stamp}.zip.age`);
  const bytes = Buffer.from("age-encryption.org/v1\nsynthetic-encrypted-payload");
  writeFileSync(ciphertext, bytes, { mode: 0o600 });
  const checksum = ciphertext + ".sha256";
  writeFileSync(
    checksum,
    `${createHash("sha256").update(bytes).digest("hex")}  ${path.basename(ciphertext)}\n`,
    { mode: 0o600 },
  );
  const output = path.join(f.root, "opened.zip");
  const args = [
    "decrypt",
    ciphertext,
    "--checksum",
    checksum,
    "--identity",
    identity,
    "--output",
    output,
  ];
  const env = { PATH: bin, STORAGE_CRYPTO_TEST_MARKER: marker };
  return { ...f, bin, marker, identity, ciphertext, checksum, output, args, env };
}

test("decryption requires age without reporting a fake successful check", () => {
  const f = decryptFixture();
  try {
    const emptyPath = path.join(f.root, "empty-bin");
    mkdirSync(emptyPath, { mode: 0o700 });
    failed(f.run(f.args, { PATH: emptyPath }));
    assert.equal(existsSync(f.output), false);
    assert.equal(existsSync(f.marker), false);
  } finally {
    f.cleanup();
  }
});

test("decryption removes partial plaintext on decoder failure and hides its stderr", () => {
  const f = decryptFixture();
  try {
    failed(f.run(f.args, f.env));
    assert.equal(readFileSync(f.marker, "utf8"), "called");
    assert.equal(existsSync(f.output), false);
  } finally {
    f.cleanup();
  }
});

test("a successful decoder cannot leave a malformed ZIP or overwrite existing owner work", () => {
  const f = decryptFixture("printf 'synthetic-not-a-valid-ZIP'; exit 0");
  try {
    failed(f.run(f.args, f.env));
    assert.equal(existsSync(f.output), false);
    rmSync(f.marker);
    writeFileSync(f.output, "synthetic-owner-work", { mode: 0o600 });
    failed(f.run(f.args, f.env));
    assert.equal(readFileSync(f.output, "utf8"), "synthetic-owner-work");
    assert.equal(existsSync(f.marker), false);
    rmSync(f.output);
    const owner = path.join(f.root, "owner-work");
    writeFileSync(owner, "synthetic-owner-work", { mode: 0o600 });
    symlinkSync(owner, f.output);
    failed(f.run(f.args, f.env));
    assert.equal(readFileSync(owner, "utf8"), "synthetic-owner-work");
    assert.equal(existsSync(f.marker), false);
  } finally {
    f.cleanup();
  }
});

test("decryption rejects unsafe offline identity files before executing a decoder", () => {
  const f = decryptFixture();
  try {
    chmodSync(f.identity, 0o640);
    failed(f.run(f.args, f.env));
    chmodSync(f.identity, 0o600);
    const link = path.join(f.root, "identity-link");
    symlinkSync(f.identity, link);
    failed(
      f.run(
        f.args.map((value) => (value === f.identity ? link : value)),
        f.env,
      ),
    );
    rmSync(link);
    linkSync(f.identity, link);
    failed(f.run(f.args, f.env));
    rmSync(link);
    for (const invalid of [
      "AGE-PLUGIN-EXAMPLE-1synthetic",
      "ssh-private-key",
      "",
      "Q".repeat(4097),
    ]) {
      writeFileSync(f.identity, invalid, { mode: 0o600 });
      failed(f.run(f.args, f.env));
    }
    assert.equal(existsSync(f.output), false);
    assert.equal(existsSync(f.marker), false);
  } finally {
    f.cleanup();
  }
});

test("decryption rejects a wrong transfer checksum before invoking age", () => {
  const f = decryptFixture();
  try {
    writeFileSync(f.checksum, "0".repeat(64) + "  " + path.basename(f.ciphertext) + "\n");
    failed(f.run(f.args, f.env));
    assert.equal(existsSync(f.output), false);
    assert.equal(existsSync(f.marker), false);
  } finally {
    f.cleanup();
  }
});
