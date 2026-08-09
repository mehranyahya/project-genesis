import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const workflow = readFileSync(
  new URL("../../.github/workflows/deploy-cloudflare.yml", import.meta.url),
  "utf8",
);
const writerPath = new URL("../../scripts/write-cloudflare-secrets.mjs", import.meta.url);
const writer = readFileSync(writerPath, "utf8");

const workerSecretNames = [
  "SUPABASE_FUNCTION_BASE_URL",
  "EDGE_GATEWAY_KEYS_JSON",
  "EDGE_GATEWAY_PRIMARY_KEY_ID",
  "IP_HASH_SECRET",
] as const;

const forbiddenWorkerSecrets = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "REQUEST_FINGERPRINT_KEY",
  "REQUEST_FINGERPRINT_KEYS_JSON",
  "TURNSTILE_SECRET_KEY",
  "TELEGRAM_BOT_TOKEN",
] as const;

test("Cloudflare deployment is manual-only and production requires main plus exact confirmation", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.equal(/^\s*push:/m.test(workflow), false);
  assert.equal(/^\s*pull_request:/m.test(workflow), false);
  assert.equal(/^\s*environment:/m.test(workflow), false);
  assert.match(workflow, /deploy_target:/);
  assert.match(workflow, /DEPLOY_TARGET: \$\{\{ inputs\.deploy_target \}\}/);
  assert.match(workflow, /GITHUB_REF.*refs\/heads\/main/);
  assert.match(workflow, /PRODUCTION_CONFIRMATION.*DEPLOY_PRODUCTION/);
});

test("repository variables select SITE_URL, ALLOWED_ORIGINS and indexing without GitHub Environments", () => {
  for (const name of [
    "PREVIEW_SITE_URL",
    "PRODUCTION_SITE_URL",
    "PREVIEW_ALLOWED_ORIGINS",
    "PRODUCTION_ALLOWED_ORIGINS",
  ] as const) {
    assert.match(workflow, new RegExp(`vars\\.${name}`));
  }
  assert.match(workflow, /SITE_URL="\$PREVIEW_SITE_URL"/);
  assert.match(workflow, /SITE_URL="\$PRODUCTION_SITE_URL"/);
  assert.match(workflow, /ALLOWED_ORIGINS="\$PREVIEW_ALLOWED_ORIGINS"/);
  assert.match(workflow, /ALLOWED_ORIGINS="\$PRODUCTION_ALLOWED_ORIGINS"/);
  assert.match(workflow, /PUBLIC_INDEXING="false"/);
  assert.match(workflow, /PUBLIC_INDEXING="true"/);
  assert.equal(/vars\.PUBLIC_SITE_ORIGIN/.test(workflow), false);
});

test("preview uploads a version while production alone uses wrangler deploy", () => {
  assert.match(workflow, /inputs\.deploy_target == 'preview'/);
  assert.match(workflow, /npx --yes wrangler@4\.97\.0 versions upload/);
  assert.match(workflow, /inputs\.deploy_target == 'production'/);
  assert.match(workflow, /npx --yes wrangler@4\.97\.0 deploy/);
  assert.equal((workflow.match(/wrangler@4\.97\.0 deploy/g) ?? []).length, 1);

  for (const option of ["--secrets-file", "--keep-vars", "--strict"] as const) {
    assert.equal(workflow.split(option).length - 1, 2, `${option} must protect both targets`);
  }
  assert.match(workflow, /if: \$\{\{ always\(\) \}\}/);
  assert.match(workflow, /rm -f .*cloudflare-runtime-secrets\.json/);
});

test("Worker secret file contains only narrow gateway credentials", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "genesis-cloudflare-secrets-"));
  const output = path.join(directory, "runtime.json");
  const gatewaySecret = "g".repeat(40);

  try {
    const result = spawnSync(process.execPath, [writerPath.pathname, output], {
      encoding: "utf8",
      env: {
        ...process.env,
        SUPABASE_FUNCTION_BASE_URL: "https://example.supabase.co/functions/v1",
        EDGE_GATEWAY_KEYS_JSON: JSON.stringify({ "gateway-v1": gatewaySecret }),
        EDGE_GATEWAY_PRIMARY_KEY_ID: "gateway-v1",
        IP_HASH_SECRET: "i".repeat(40),
        SUPABASE_SERVICE_ROLE_KEY: "must-not-enter-worker-secret-file",
        REQUEST_FINGERPRINT_KEY: "must-not-enter-worker-secret-file",
        TURNSTILE_SECRET_KEY: "must-not-enter-worker-secret-file",
        TELEGRAM_BOT_TOKEN: "must-not-enter-worker-secret-file",
        SMS_API_KEY: "must-not-enter-worker-secret-file",
      },
    });

    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
    const parsed = JSON.parse(readFileSync(output, "utf8")) as Record<string, string>;
    assert.deepEqual(Object.keys(parsed).sort(), [...workerSecretNames].sort());
    for (const name of forbiddenWorkerSecrets) assert.equal(name in parsed, false, name);
    assert.equal("SMS_API_KEY" in parsed, false);

    if (process.platform !== "win32") {
      assert.equal(statSync(output).mode & 0o777, 0o600);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("workflow never injects privileged Edge Function secrets into Cloudflare", () => {
  for (const name of workerSecretNames) {
    assert.match(workflow, new RegExp(`secrets\\.${name}`));
    assert.match(writer, new RegExp(`\\b${name}\\b`));
  }
  for (const name of forbiddenWorkerSecrets) {
    assert.equal(new RegExp(`secrets\\.${name}`).test(workflow), false, name);
  }
  assert.equal(/SMS_[A-Z0-9_]+/.test(workflow), false);
  assert.equal(/SMS_[A-Z0-9_]+/.test(writer), false);
});
