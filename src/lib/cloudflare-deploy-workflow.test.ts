import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const entryWorkflow = readFileSync(
  new URL("../../.github/workflows/deploy-cloudflare.yml", import.meta.url),
  "utf8",
);
const reusableWorkflow = readFileSync(
  new URL("../../.github/workflows/deploy-cloudflare-reusable.yml", import.meta.url),
  "utf8",
);
const workflow = `${entryWorkflow}\n${reusableWorkflow}`;
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
  assert.equal(/^\s*push:/m.test(entryWorkflow), false);
  assert.equal(/^\s*pull_request:/m.test(entryWorkflow), false);
  assert.equal(/^\s*environment:/m.test(workflow), false);
  assert.match(workflow, /deploy_target:/);
  assert.match(workflow, /DEPLOY_TARGET: \$\{\{ inputs\.target \}\}/);
  assert.match(workflow, /GITHUB_REF.*refs\/heads\/main/);
  assert.match(workflow, /PRODUCTION_CONFIRMATION.*DEPLOY_PRODUCTION/);
  assert.match(workflow, /CONTENT_CONFIRMATION.*CONTENT_FINALIZED/);
  assert.match(workflow, /MIGRATION_CONFIRMATION.*MIGRATIONS_VERIFIED_AFTER_BACKUP/);
  assert.match(reusableWorkflow, /bun run content:release-check/);
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
  assert.match(entryWorkflow, /site_url: \$\{\{ vars\.PREVIEW_SITE_URL \}\}/);
  assert.match(entryWorkflow, /site_url: \$\{\{ vars\.PRODUCTION_SITE_URL \}\}/);
  assert.match(entryWorkflow, /allowed_origins: \$\{\{ vars\.PREVIEW_ALLOWED_ORIGINS \}\}/);
  assert.match(entryWorkflow, /allowed_origins: \$\{\{ vars\.PRODUCTION_ALLOWED_ORIGINS \}\}/);
  assert.match(reusableWorkflow, /SITE_URL: \$\{\{ inputs\.site_url \}\}/);
  assert.match(reusableWorkflow, /ALLOWED_ORIGINS: \$\{\{ inputs\.allowed_origins \}\}/);
  assert.equal(/vars\.PUBLIC_SITE_ORIGIN/.test(workflow), false);
});

test("preview uploads a version while production alone uses wrangler deploy", () => {
  assert.match(entryWorkflow, /inputs\.deploy_target == 'preview'/);
  assert.match(reusableWorkflow, /bunx wrangler versions upload/);
  assert.match(reusableWorkflow, /--preview-alias staging/);
  assert.match(entryWorkflow, /inputs\.deploy_target == 'production'/);
  assert.match(reusableWorkflow, /bunx wrangler deploy/);
  assert.match(reusableWorkflow, /--dry-run/);

  for (const option of ["--secrets-file", "--keep-vars"] as const) {
    assert.equal(
      reusableWorkflow.split(option).length - 1,
      2,
      `${option} must protect both targets`,
    );
  }
  assert.equal(reusableWorkflow.split("--strict").length - 1, 3);
  assert.match(reusableWorkflow, /if: \$\{\{ always\(\) \}\}/);
  assert.match(reusableWorkflow, /rm -f .*cloudflare-runtime-secrets\.json/);
  assert.match(reusableWorkflow, /actions\/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd/);
  assert.match(reusableWorkflow, /setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6/);
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

test("entry workflow isolates preview and production credentials", () => {
  for (const target of ["PREVIEW", "PRODUCTION"] as const) {
    for (const name of [
      "CLOUDFLARE_ACCOUNT_ID",
      "CLOUDFLARE_API_TOKEN",
      "VITE_TURNSTILE_SITE_KEY",
      ...workerSecretNames,
    ] as const) {
      assert.match(entryWorkflow, new RegExp(`secrets\\.${target}_${name}`));
    }
  }
});

test("Worker secret writer rejects non-canonical or duplicate gateway key maps", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "genesis-cloudflare-invalid-secrets-"));
  const output = path.join(directory, "runtime.json");
  const common = {
    ...process.env,
    SUPABASE_FUNCTION_BASE_URL: "https://example.supabase.co/functions/v1",
    EDGE_GATEWAY_PRIMARY_KEY_ID: "gateway-v1",
    IP_HASH_SECRET: "i".repeat(40),
  };
  try {
    for (const raw of [
      `{ "gateway-v1": "${"g".repeat(40)}" }`,
      `{"gateway-v1":"${"g".repeat(40)}","gateway-v1":"${"h".repeat(40)}"}`,
    ]) {
      const result = spawnSync(process.execPath, [writerPath.pathname, output], {
        encoding: "utf8",
        env: { ...common, EDGE_GATEWAY_KEYS_JSON: raw },
      });
      assert.notEqual(result.status, 0);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
