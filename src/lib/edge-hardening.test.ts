import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const edgeSubmit = readFileSync(
  new URL("../../supabase/functions/submit-request/index.ts", import.meta.url),
  "utf8",
);
const edgeGateway = readFileSync(
  new URL("../../supabase/functions/_shared/gateway-auth.ts", import.meta.url),
  "utf8",
);
const edgeTurnstile = readFileSync(
  new URL("../../supabase/functions/_shared/turnstile.ts", import.meta.url),
  "utf8",
);
const edgeRest = readFileSync(
  new URL("../../supabase/functions/_shared/supabase-rest.ts", import.meta.url),
  "utf8",
);
const edgeJson = readFileSync(
  new URL("../../supabase/functions/_shared/json.ts", import.meta.url),
  "utf8",
);
const storageMigration = readFileSync(
  new URL(
    "../../supabase/migrations/20260809234500_add_narrow_request_storage_rpc.sql",
    import.meta.url,
  ),
  "utf8",
);

test("signed Edge inputs use strict JSON and canonical own-property-safe objects", () => {
  assert.match(edgeGateway, /parseStrictJson\(rawBody\)/);
  assert.match(edgeGateway, /rawBody !== canonicalBody/);
  assert.match(edgeSubmit, /parseStrictJson\(rawMap\)/);
  assert.match(edgeJson, /const keys = new Set<string>\(\)/);
  assert.match(edgeJson, /Object\.create\(null\)/);
  assert.match(edgeJson, /TextDecoder\("utf-8", \{ fatal: true \}\)/);
});

test("Turnstile retries only temporary failures and treats HTTP 400 as invalid", () => {
  const temporaryPosition = edgeTurnstile.indexOf(
    "response.status === 429 || response.status >= 500",
  );
  const invalidPosition = edgeTurnstile.indexOf('if (!response.ok) return { kind: "invalid" }');
  assert.ok(temporaryPosition >= 0 && invalidPosition > temporaryPosition);
  assert.match(edgeTurnstile, /SITEVERIFY_RESPONSE_LIMIT/);
  assert.match(edgeTurnstile, /redirect: "error"/);
  assert.match(edgeRest, /RESPONSE_BODY_LIMIT/);
  assert.match(edgeRest, /redirect: "error"/);
});

test("idempotent replay checks both fingerprint keys before consuming Turnstile", () => {
  assert.match(edgeSubmit, /Object\.keys\(fingerprintConfig\.keys\)/);
  assert.match(edgeSubmit, /for \(let index = 0; index < candidates\.length; index \+= 1\)/);
  assert.match(edgeSubmit, /IDEMPOTENCY_CONFLICT.*index \+ 1 < candidates\.length/);
  const inspectPosition = edgeSubmit.indexOf("inspect_request_idempotency");
  const turnstilePosition = edgeSubmit.indexOf("verifyTurnstile({");
  assert.ok(inspectPosition >= 0 && turnstilePosition > inspectPosition);
});

test("tracking prefix and internal request id are exact across Edge and storage", () => {
  assert.match(edgeSubmit, /return value === "MA"/);
  assert.match(storageMigration, /p_tracking_code_prefix is distinct from 'MA'/);
  assert.match(storageMigration, /v_tracking_code := 'MA-' \|\| v_sequence_value::text/);
  assert.match(storageMigration, /returning id into v_request_id/);
  assert.match(storageMigration, /'request_id', v_request_id/);
});

test("catastrophic HTML is Persian, static and security-headered", () => {
  const page = readFileSync(new URL("error-page.ts", import.meta.url), "utf8");
  const server = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
  assert.match(page, /<html lang="fa" dir="rtl">/);
  assert.match(page, /بارگذاری این صفحه انجام نشد/);
  assert.doesNotMatch(page, /onclick=|<script/i);
  assert.match(server, /content-security-policy/);
  assert.match(server, /cache-control.*no-store/);
  assert.match(server, /x-content-type-options.*nosniff/);
});
