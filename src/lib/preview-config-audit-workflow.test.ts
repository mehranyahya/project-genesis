import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const workflow = readFileSync(
  new URL("../../.github/workflows/audit-preview-config.yml", import.meta.url),
  "utf8",
);

test("Preview configuration audit is read-only, bounded and self-validating", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /push:[\s\S]*branches:[\s\S]*- main/);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /timeout-minutes: 5/);
  assert.match(workflow, /version: 2\.115\.0/);
  assert.doesNotMatch(workflow, /contents: write|pull_request:/);
  assert.doesNotMatch(workflow, /supabase secrets set|wrangler deploy|wrangler versions upload/);
});

test("Preview configuration audit covers every deploy input without logging values", () => {
  const githubNames = [
    "PREVIEW_CLOUDFLARE_ACCOUNT_ID",
    "PREVIEW_CLOUDFLARE_API_TOKEN",
    "PREVIEW_VITE_TURNSTILE_SITE_KEY",
    "PREVIEW_SUPABASE_FUNCTION_BASE_URL",
    "PREVIEW_EDGE_GATEWAY_KEYS_JSON",
    "PREVIEW_EDGE_GATEWAY_PRIMARY_KEY_ID",
    "PREVIEW_IP_HASH_SECRET",
    "PREVIEW_BUILD_SUPABASE_URL",
    "PREVIEW_BUILD_SUPABASE_SERVICE_ROLE_KEY",
    "PREVIEW_SITE_URL",
    "PREVIEW_ALLOWED_ORIGINS",
  ];
  const edgeNames = [
    "EDGE_GATEWAY_KEYS_JSON",
    "REQUEST_FINGERPRINT_KEYS_JSON",
    "REQUEST_FINGERPRINT_PRIMARY_KEY_ID",
    "TRACKING_CODE_PREFIX",
    "TURNSTILE_SECRET_KEY",
    "TURNSTILE_ALLOWED_HOSTNAMES",
    "TURNSTILE_EXPECTED_ACTION",
    "SITEVERIFY_NAMESPACE_UUID",
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_ADMIN_CHAT_ID",
  ];

  for (const name of [...githubNames, ...edgeNames]) {
    assert.match(workflow, new RegExp(`\\b${name}\\b`));
  }
  assert.match(workflow, /supabase secrets list[\s\S]*--output json/);
  assert.match(workflow, /Missing GitHub Preview configuration/);
  assert.match(workflow, /Missing Supabase Edge secret names/);
  assert.doesNotMatch(workflow, /set -x|printenv|env \|/);
});
