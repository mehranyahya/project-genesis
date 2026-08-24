import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260824190800_add_narrow_request_storage_rpc.sql",
    import.meta.url,
  ),
  "utf8",
);

test("storage RPC owns idempotency, rate, sequence and insert but no business catalog queries", () => {
  assert.match(migration, /create or replace function public\.create_request_atomic_storage/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /request_rate_limit_policy/);
  assert.match(migration, /nextval\('public\.request_code_seq'/);
  assert.match(migration, /insert into public\.requests/);
  assert.match(migration, /REQUEST_REPLAYED/);
  assert.match(migration, /IDEMPOTENCY_CONFLICT/);
  assert.match(migration, /IDEMPOTENCY_EXPIRED/);
  assert.match(migration, /RATE_LIMITED/);

  for (const forbidden of [
    "from public.products",
    "from public.product_variants",
    "from public.product_options",
    "from public.portfolio_items",
    "compute_operational_catalog_version",
    "p_current_terms_version",
    "p_current_terms_hash",
    "PRICE_CHANGED",
    "TERMS_UPDATED",
    "SELECTION_UNAVAILABLE",
  ] as const) {
    assert.equal(migration.includes(forbidden), false, forbidden);
  }
});

test("storage RPC retains exact v23 rate policy semantics and timeout boundary", () => {
  assert.match(migration, /set statement_timeout to '5s'/);
  assert.match(migration, /set lock_timeout to '3s'/);
  assert.match(migration, /v_policy\.max_requests_per_phone/);
  assert.match(migration, /v_policy\.max_no_token_per_phone/);
  assert.match(migration, /v_policy\.max_service_error_global/);
  assert.match(migration, /v_policy\.max_service_error_per_ip_phone/);
  assert.match(migration, /v_policy\.max_requests_per_ip/);
  assert.match(migration, /shared_ip_volume/);
  assert.match(migration, /repeat_phone_short_window/);
  assert.match(migration, /p_bot_verification <> 'verified'/);
});

test("historical business-heavy RPCs lose service-role execute after cutover", () => {
  assert.match(
    migration,
    /revoke execute on function public\.create_request_atomic\([\s\S]*from service_role/,
  );
  assert.match(
    migration,
    /revoke execute on function public\.create_request_atomic_core\([\s\S]*from service_role/,
  );
  assert.match(
    migration,
    /grant execute on function public\.create_request_atomic_storage\([\s\S]*to service_role/,
  );
});
