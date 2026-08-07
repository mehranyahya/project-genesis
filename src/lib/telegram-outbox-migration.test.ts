import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260807190000_add_telegram_outbox_rpcs.sql",
    import.meta.url,
  ),
  "utf8",
);

function functionBody(name: string): string {
  const marker = `create function public.${name}`;
  const start = migration.indexOf(marker);
  assert.ok(start >= 0, `${name} must exist`);
  const bodyStart = migration.indexOf("as $$", start);
  const bodyEnd = migration.indexOf("$$;", bodyStart + 5);
  assert.ok(bodyStart > start && bodyEnd > bodyStart, `${name} body must be bounded`);
  return migration.slice(start, bodyEnd + 3);
}

test("Telegram state constraint matches the v23.2 four-state contract", () => {
  assert.match(migration, /add constraint requests_telegram_state_chk check/);
  assert.match(migration, /telegram_status = 'pending'/);
  assert.match(migration, /telegram_attempt_count between 0 and 4/);
  assert.match(migration, /telegram_status = 'sending'/);
  assert.match(migration, /telegram_attempt_count between 1 and 5/);
  assert.match(migration, /telegram_status = 'sent'/);
  assert.match(migration, /telegram_status = 'failed'/);
  assert.match(migration, /telegram_next_attempt_at = created_at/);
  assert.match(migration, /telegram_alerted_at >= telegram_failed_at/);
});

test("claim is bounded, lease-based and finalizes an expired fifth attempt", () => {
  const claim = functionBody("claim_telegram_notifications");
  assert.match(claim, /p_limit integer default 25/);
  assert.match(claim, /p_limit < 1 or p_limit > 25/);
  assert.match(claim, /telegram_attempt_count = 5/);
  assert.match(claim, /telegram_lease_until <= v_now/);
  assert.match(claim, /telegram_status = 'failed'/);
  assert.match(claim, /for update skip locked/);
  assert.match(claim, /telegram_attempt_count = r\.telegram_attempt_count \+ 1/);
  assert.match(claim, /telegram_last_attempt_at = v_now/);
  assert.match(claim, /telegram_lease_until = v_now \+ interval '2 minutes'/);
});

test("claim supports one specific first-attempt request without a parallel code path", () => {
  const claim = functionBody("claim_telegram_notifications");
  assert.match(claim, /p_request_id uuid default null/);
  assert.match(claim, /case when p_request_id is null then p_limit else 1 end/);
  assert.match(claim, /p_request_id is null or r\.id = p_request_id/);
});

test("claim output contains delivery data but no request-security material", () => {
  const claim = functionBody("claim_telegram_notifications");
  for (const key of [
    "tracking_code",
    "request_type",
    "customer_name",
    "phone",
    "configuration",
    "price",
    "attempt",
    "lease_until",
  ]) {
    assert.match(claim, new RegExp(`'${key}'`));
  }
  for (const forbidden of [
    "request_fingerprint",
    "request_fingerprint_key_id",
    "ip_hash",
    "terms_content_hash",
  ]) {
    assert.equal(
      new RegExp(`'${forbidden}'`).test(claim),
      false,
      `${forbidden} must not leave the claim RPC`,
    );
  }
});

test("completion rejects null/invalid outcomes and stale attempt generations", () => {
  const complete = functionBody("complete_telegram_notification");
  assert.match(complete, /p_outcome is null/);
  assert.match(complete, /p_outcome not in \('sent', 'retryable', 'permanent_failure'\)/);
  assert.match(complete, /p_retry_after_seconds < 1/);
  assert.match(complete, /p_outcome <> 'retryable' and p_retry_after_seconds is not null/);
  assert.match(complete, /v_request\.telegram_status <> 'sending'/);
  assert.match(complete, /v_request\.telegram_attempt_count <> p_attempt/);
  assert.match(complete, /'code', 'STALE'/);
});

test("retry calendar is exactly immediate, +1h, +4h, +12h, +24h", () => {
  const complete = functionBody("complete_telegram_notification");
  assert.match(complete, /when 1 then v_request\.created_at \+ interval '1 hour'/);
  assert.match(complete, /when 2 then v_request\.created_at \+ interval '4 hours'/);
  assert.match(complete, /when 3 then v_request\.created_at \+ interval '12 hours'/);
  assert.match(complete, /when 4 then v_request\.created_at \+ interval '24 hours'/);
  assert.match(complete, /p_outcome = 'permanent_failure' or p_attempt = 5/);
  assert.match(complete, /greatest\(/);
  assert.match(complete, /make_interval\(secs => p_retry_after_seconds\)/);
});

test("Telegram RPCs are SECURITY DEFINER, fixed-path and service-role only", () => {
  for (const name of ["claim_telegram_notifications", "complete_telegram_notification"]) {
    const body = functionBody(name);
    assert.match(body, /security definer/);
    assert.match(body, /set search_path = pg_catalog/);
  }

  assert.match(
    migration,
    /revoke all on function public\.claim_telegram_notifications\(integer, uuid\)[\s\S]*?from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.claim_telegram_notifications\(integer, uuid\)[\s\S]*?to service_role/,
  );
  assert.match(
    migration,
    /revoke all on function public\.complete_telegram_notification\(uuid, integer, text, integer\)[\s\S]*?from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.complete_telegram_notification\(uuid, integer, text, integer\)[\s\S]*?to service_role/,
  );
});

test("outbox migration never edits the request creation RPC", () => {
  assert.equal(/create\s+(or\s+replace\s+)?function\s+public\.create_request_atomic\b/i.test(migration), false);
  assert.equal(/alter\s+function\s+public\.create_request_atomic\b/i.test(migration), false);
});
