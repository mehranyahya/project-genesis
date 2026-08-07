import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260807203909_inspect_request_idempotency.sql",
    import.meta.url,
  ),
  "utf8",
);

test("idempotency inspection is read-only and service-role only", () => {
  assert.match(migration, /create or replace function public\.inspect_request_idempotency/);
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = pg_catalog/);
  assert.match(migration, /set statement_timeout to '3s'/);
  assert.match(
    migration,
    /revoke all on function public\.inspect_request_idempotency\(uuid,text,text\)[\s\S]*?from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.inspect_request_idempotency\(uuid,text,text\)[\s\S]*?to service_role/,
  );
  assert.equal(/\binsert\b|\bupdate\b|\bdelete\b/i.test(migration.replace(/^--.*$/gm, "")), false);
});

test("inspection mirrors idempotency outcomes without returning request PII", () => {
  assert.match(migration, /'MISSING'/);
  assert.match(migration, /'REQUEST_REPLAYED'/);
  assert.match(migration, /'IDEMPOTENCY_CONFLICT'/);
  assert.match(migration, /'IDEMPOTENCY_EXPIRED'/);
  assert.match(migration, /request_fingerprint is null/);
  assert.match(migration, /idempotency_expires_at/);
  assert.match(migration, /tracking_code/);

  for (const pii of [
    "customer_name",
    "phone_normalized",
    "city",
    "location_text",
    "customer_note",
  ]) {
    assert.equal(new RegExp(`jsonb_build_object\\([^)]*${pii}`, "is").test(migration), false);
  }
});
