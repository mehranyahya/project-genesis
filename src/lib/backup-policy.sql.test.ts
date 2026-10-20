import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

test(
  "backup policy SQL passes all five isolated source and restored-copy scenarios",
  { timeout: 35_000 },
  () => {
    const result = spawnSync(
      "node",
      ["--test", "--test-reporter=tap", "scripts/check-backup-policy.mjs"],
      {
        cwd: fileURLToPath(new URL("../../", import.meta.url)),
        encoding: "utf8",
        timeout: 30_000,
        maxBuffer: 2 * 1024 * 1024,
      },
    );
    const output = `${result.stdout}\n${result.stderr}`;
    assert.equal(result.error, undefined, output);
    assert.equal(result.signal, null, output);
    assert.equal(result.status, 0, output);
    assert.match(output, /# tests 5\b/, output);
    assert.match(output, /# pass 5\b/, output);
    assert.match(output, /# fail 0\b/, output);
  },
);
