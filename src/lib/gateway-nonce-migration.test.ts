import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260824190653_add_gateway_nonce_replay_guard.sql",
    import.meta.url,
  ),
  "utf8",
);

test("gateway nonce table is short-lived, forced-RLS and service-role only", () => {
  assert.match(migration, /create table public\.gateway_nonces/);
  assert.match(migration, /nonce text primary key/);
  assert.match(migration, /expires_at <= seen_at \+ interval '5 minutes'/);
  assert.match(migration, /alter table public\.gateway_nonces enable row level security/);
  assert.match(migration, /alter table public\.gateway_nonces force row level security/);
  assert.match(
    migration,
    /revoke all on table public\.gateway_nonces from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant select, insert, delete on table public\.gateway_nonces to service_role/,
  );
  assert.match(migration, /gateway_nonces_expires_at_idx/);
});

test("nonce claim is atomic, timestamp bounded and never executable by browser roles", () => {
  assert.match(migration, /create or replace function public\.claim_gateway_nonce/);
  assert.match(migration, /v_received_at < v_now - interval '60 seconds'/);
  assert.match(migration, /v_received_at > v_now \+ interval '30 seconds'/);
  assert.match(migration, /on conflict \(nonce\) do nothing/);
  assert.match(migration, /get diagnostics v_inserted = row_count/);
  assert.match(migration, /return v_inserted = 1/);
  assert.match(
    migration,
    /revoke all on function public\.claim_gateway_nonce\(text,text,bigint\)[\s\S]*from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.claim_gateway_nonce\(text,text,bigint\)[\s\S]*to service_role/,
  );
  assert.match(migration, /set statement_timeout to '3s'/);
  assert.match(migration, /set lock_timeout to '1s'/);
  assert.match(migration, /for update skip locked/);
  assert.match(migration, /limit 100/);
  assert.match(migration, /delete from public\.gateway_nonces n[\s\S]*using expired e/);
});
