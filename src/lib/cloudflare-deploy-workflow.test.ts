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
const implementationWorkflow = readFileSync(
  new URL("../../.github/workflows/deploy-cloudflare-reusable.yml", import.meta.url),
  "utf8",
);
const writerPath = new URL("../../scripts/write-cloudflare-secrets.mjs", import.meta.url);
const writer = readFileSync(writerPath, "utf8");

const runtimeSecretNames = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "REQUEST_FINGERPRINT_KEY",
  "REQUEST_FINGERPRINT_KEY_ID",
  "IP_HASH_KEY",
  "TURNSTILE_SECRET_KEY",
  "TURNSTILE_ALLOWED_HOSTNAMES",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_ADMIN_CHAT_ID",
] as const;

test("Cloudflare deployment is manual-only and production requires main plus exact confirmation", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.equal(/^\s*push:/m.test(workflow), false);
  assert.equal(/^\s*pull_request:/m.test(workflow), false);
  assert.equal(/^\s*environment:/m.test(`${workflow}\n${implementationWorkflow}`), false);
  assert.match(workflow, /uses: \.\/\.github\/workflows\/deploy-cloudflare-reusable\.yml/);
  assert.match(implementationWorkflow, /DEPLOY_TARGET: \$\{\{ inputs\.target \}\}/);
  assert.match(implementationWorkflow, /GITHUB_REF.*refs\/heads\/main/);
  assert.match(implementationWorkflow, /PRODUCTION_CONFIRMATION.*DEPLOY_PRODUCTION/);
});

test("preview uploads a version while production alone uses wrangler deploy", () => {
  assert.match(implementationWorkflow, /if: \$\{\{ inputs\.target == 'preview' \}\}/);
  assert.match(implementationWorkflow, /npx --yes wrangler@4\.97\.0 versions upload/);
  assert.match(implementationWorkflow, /--preview-alias staging/);
  assert.match(implementationWorkflow, /if: \$\{\{ inputs\.target == 'production' \}\}/);
  assert.match(implementationWorkflow, /npx --yes wrangler@4\.97\.0 deploy/);

  const deployOccurrences = implementationWorkflow.match(/wrangler@4\.97\.0 deploy/g) ?? [];
  assert.equal(deployOccurrences.length, 1);

  for (const option of ["--secrets-file", "--keep-vars", "--strict"] as const) {
    assert.equal(
      implementationWorkflow.split(option).length - 1,
      2,
      `${option} must protect both targets`,
    );
  }
  assert.match(implementationWorkflow, /if: \$\{\{ always\(\) \}\}/);
  assert.match(implementationWorkflow, /rm -f .*cloudflare-runtime-secrets\.json/);
});

test("workflow fails before build/deploy when required repository configuration is absent", () => {
  assert.match(
    implementationWorkflow,
    /VITE_TURNSTILE_SITE_KEY: \$\{\{ secrets\.VITE_TURNSTILE_SITE_KEY \}\}/,
  );
  assert.match(
    implementationWorkflow,
    /CLOUDFLARE_ACCOUNT_ID: \$\{\{ secrets\.CLOUDFLARE_ACCOUNT_ID \}\}/,
  );
  assert.match(
    implementationWorkflow,
    /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/,
  );
  assert.match(workflow, /secrets\.PREVIEW_VITE_TURNSTILE_SITE_KEY/);
  assert.match(workflow, /secrets\.PRODUCTION_VITE_TURNSTILE_SITE_KEY/);
  assert.match(workflow, /vars\.PRODUCTION_PUBLIC_SITE_ORIGIN/);
  assert.match(implementationWorkflow, /Validate public build configuration/);
  assert.match(implementationWorkflow, /Validate Cloudflare CI credentials/);
  assert.match(implementationWorkflow, /node scripts\/prepare-cloudflare-deploy\.mjs/);
  assert.match(implementationWorkflow, /node scripts\/verify-cloudflare-deploy\.mjs/);
});

test("runtime secret writer emits only the approved server keys with restrictive permissions", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "genesis-cloudflare-secrets-"));
  const output = path.join(directory, "runtime.json");

  try {
    const result = spawnSync(process.execPath, [writerPath.pathname, output], {
      encoding: "utf8",
      env: {
        ...process.env,
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-placeholder",
        REQUEST_FINGERPRINT_KEY: "f".repeat(40),
        REQUEST_FINGERPRINT_KEY_ID: "request-v1",
        IP_HASH_KEY: "i".repeat(40),
        TURNSTILE_SECRET_KEY: "turnstile-placeholder",
        TURNSTILE_ALLOWED_HOSTNAMES: "example.com,www.example.com",
        TELEGRAM_BOT_TOKEN: "telegram-placeholder",
        TELEGRAM_ADMIN_CHAT_ID: "-1001234567890",
        CLOUDFLARE_ACCOUNT_ID: "must-not-enter-worker-secret-file",
        CLOUDFLARE_API_TOKEN: "must-not-enter-worker-secret-file",
        SMS_API_KEY: "must-not-enter-worker-secret-file",
      },
    });

    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
    const parsed = JSON.parse(readFileSync(output, "utf8")) as Record<string, string>;
    assert.deepEqual(Object.keys(parsed).sort(), [...runtimeSecretNames].sort());
    assert.equal("CLOUDFLARE_API_TOKEN" in parsed, false);
    assert.equal("CLOUDFLARE_ACCOUNT_ID" in parsed, false);
    assert.equal("SMS_API_KEY" in parsed, false);

    if (process.platform !== "win32") {
      assert.equal(statSync(output).mode & 0o777, 0o600);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("deployment source contains no SMS provider dependency", () => {
  assert.equal(/SMS_[A-Z0-9_]+/.test(`${workflow}\n${implementationWorkflow}`), false);
  assert.equal(/SMS_[A-Z0-9_]+/.test(writer), false);
  for (const name of runtimeSecretNames) {
    assert.match(implementationWorkflow, new RegExp(`secrets\\.${name}`));
    assert.match(workflow, new RegExp(`secrets\\.PREVIEW_${name}`));
    assert.match(workflow, new RegExp(`secrets\\.PRODUCTION_${name}`));
    assert.match(writer, new RegExp(`\\b${name}\\b`));
  }
});
