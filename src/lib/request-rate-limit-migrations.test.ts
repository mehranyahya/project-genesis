import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const policy = readFileSync(
  new URL(
    "../../supabase/migrations/20260807173000_add_request_rate_limit_policy.sql",
    import.meta.url,
  ),
  "utf8",
);
const indexes = readFileSync(
  new URL(
    "../../supabase/migrations/20260807173100_ensure_request_rate_limit_indexes.sql",
    import.meta.url,
  ),
  "utf8",
);
const windowLock = readFileSync(
  new URL(
    "../../supabase/migrations/20260807173200_lock_request_rate_limit_window.sql",
    import.meta.url,
  ),
  "utf8",
);

test("rate-limit policy starts fail-closed without invented request ceilings", () => {
  assert.match(policy, /enabled boolean not null default false/);
  assert.match(policy, /max_requests_per_ip integer null/);
  assert.match(policy, /max_requests_per_phone integer null/);
  assert.equal(/max_requests_per_ip\s+integer[^\n]*default\s+\d/i.test(policy), false);
  assert.equal(/max_requests_per_phone\s+integer[^\n]*default\s+\d/i.test(policy), false);
  assert.match(
    policy,
    /values\s*\(\s*'primary',\s*false,\s*null,\s*null,\s*null\s*\)/s,
  );
  assert.match(policy, /'code', 'TEMPORARILY_UNAVAILABLE'/);
});

test("policy table and RPC privilege surface remain server-only", () => {
  assert.match(policy, /enable row level security/);
  assert.match(policy, /force row level security/);
  assert.match(
    policy,
    /revoke all on table public\.request_rate_limit_policy from public, anon, authenticated, service_role/,
  );
  assert.match(
    policy,
    /revoke all on function public\.create_request_atomic_core\([\s\S]*?service_role/,
  );
  assert.match(
    policy,
    /grant execute on function public\.create_request_atomic\([\s\S]*?to service_role/,
  );
  assert.equal(/grant\s+.*\s+to\s+(anon|authenticated)/i.test(policy), false);
});

test("idempotent replay is resolved before the new-request policy gate", () => {
  const replayCheck = policy.indexOf("where r.submission_id = v_submission_id");
  const policyRead = policy.indexOf("from public.request_rate_limit_policy p");
  assert.ok(replayCheck > 0);
  assert.ok(policyRead > replayCheck);
  assert.match(policy, /return public\.create_request_atomic_core\(/);
});

test("concurrent IP and phone decisions are serialized in a fixed order", () => {
  const ipLock = policy.indexOf("request-rate-ip|");
  const phoneLock = policy.indexOf("request-rate-phone|");
  assert.ok(ipLock > 0);
  assert.ok(phoneLock > ipLock);
  assert.match(policy, /pg_advisory_xact_lock/);
  assert.match(policy, /where r\.ip_hash = p_ip_hash/);
  assert.match(policy, /where r\.phone_normalized = v_phone/);
  assert.match(policy, /'code', 'RATE_LIMITED'/);
});

test("rate-limit count queries have dedicated composite indexes", () => {
  assert.match(indexes, /requests_rate_ip_created_idx/);
  assert.match(indexes, /\(ip_hash, created_at desc\)/);
  assert.match(indexes, /requests_rate_phone_created_idx/);
  assert.match(indexes, /\(phone_normalized, created_at desc\)/);
  assert.match(indexes, /anonymized_at is null/);
});

test("database rate window is locked to the HTTP Retry-After contract", () => {
  assert.match(windowLock, /set window_seconds = 600/);
  assert.match(windowLock, /alter column window_seconds set default 600/);
  assert.match(windowLock, /alter column window_seconds set not null/);
  assert.match(windowLock, /check \(window_seconds = 600\)/);
});
