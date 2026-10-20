import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

test("SMS SQL passes all 20 isolated PostgreSQL fixture scenarios with a complete TAP result", () => {
  const result = spawnSync(
    "node",
    ["--test", "--test-reporter=tap", "scripts/check-sms-outbox.mjs"],
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
  // An early process exit must never be mistaken for a successful SQL suite.
  assert.match(output, /# tests 20\b/, output);
  assert.match(output, /# pass 20\b/, output);
  assert.match(output, /# fail 0\b/, output);
});
