import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260807201233_align_turnstile_and_rate_limits_v23.sql",
    import.meta.url,
  ),
  "utf8",
);
const indexes = readFileSync(
  new URL(
    "../../supabase/migrations/20260807201245_add_v23_rate_limit_indexes.sql",
    import.meta.url,
  ),
  "utf8",
);

test("v23.2 launch ceilings are explicit and migration leaves policy disabled", () => {
  assert.match(migration, /enabled = false/);
  assert.match(migration, /window_seconds = 600/);
  assert.match(migration, /max_requests_per_phone = 3/);
  assert.match(migration, /max_requests_per_ip = 200/);
  assert.match(migration, /ip_window_seconds = 3600/);
  assert.match(migration, /no_token_phone_window_seconds = 1800/);
  assert.match(migration, /max_no_token_per_phone = 2/);
  assert.match(migration, /service_error_window_seconds = 3600/);
  assert.match(migration, /max_service_error_global = 20/);
  assert.match(migration, /max_service_error_per_ip_phone = 3/);
  assert.match(migration, /shared_ip_soft_threshold = 20/);
});

test("same phone and request type is patched from a hard block into a review flag", () => {
  assert.match(migration, /create_request_atomic_core duplicate block drifted/);
  assert.match(
    migration,
    /p_risk_flags := p_risk_flags \|\| '\["repeat_phone_short_window"\]'::jsonb/,
  );
  assert.match(
    migration,
    /v_risk_flags := v_risk_flags \|\| '\["repeat_phone_short_window"\]'::jsonb/,
  );
});

test("general and missing-token phone ceilings are independent of IP", () => {
  assert.match(
    migration,
    /where r\.phone_normalized = v_phone[\s\S]*?v_policy\.window_seconds[\s\S]*?v_policy\.max_requests_per_phone/,
  );
  assert.match(
    migration,
    /r\.bot_verification = 'unverified_no_token'[\s\S]*?no_token_phone_window_seconds[\s\S]*?max_no_token_per_phone/,
  );
});

test("service-error path has global and combined ip+phone ceilings", () => {
  assert.match(
    migration,
    /p_bot_verification = 'unverified_service_error'[\s\S]*?max_service_error_global/,
  );
  assert.match(
    migration,
    /r\.ip_hash = p_ip_hash[\s\S]*?r\.phone_normalized = v_phone[\s\S]*?max_service_error_per_ip_phone/,
  );
});

test("shared IP is soft at 20 and hard at 200 only for unverified traffic", () => {
  assert.match(migration, /p_bot_verification <> 'verified'/);
  assert.match(
    migration,
    /r\.bot_verification in \('unverified_no_token','unverified_service_error'\)/,
  );
  assert.match(migration, /v_policy\.max_requests_per_ip/);
  assert.match(migration, /shared_ip_soft_threshold/);
  assert.match(migration, /v_risk_flags := v_risk_flags \|\| '\["shared_ip_volume"\]'::jsonb/);
});

test("request RPC functions carry bounded database timeouts", () => {
  assert.match(migration, /create_request_atomic_core[\s\S]*?set statement_timeout to '5s'/);
  assert.match(migration, /create_request_atomic_core[\s\S]*?set lock_timeout to '3s'/);
  assert.match(
    migration,
    /create or replace function public\.create_request_atomic[\s\S]*?set statement_timeout to '5s'/,
  );
  assert.match(
    migration,
    /create or replace function public\.create_request_atomic[\s\S]*?set lock_timeout to '3s'/,
  );
});

test("v23.2 rate-limit queries have dedicated service-error indexes", () => {
  assert.match(indexes, /requests_bot_verification_created_idx/);
  assert.match(indexes, /\(bot_verification, created_at desc\)/);
  assert.match(indexes, /requests_ip_bot_created_idx/);
  assert.match(indexes, /\(ip_hash, bot_verification, created_at desc\)/);
  assert.match(indexes, /requests_ip_phone_bot_created_idx/);
  assert.match(indexes, /\(ip_hash, phone_normalized, bot_verification, created_at desc\)/);
});
