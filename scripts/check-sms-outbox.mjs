// Isolated PostgreSQL fixture: node --test scripts/check-sms-outbox.mjs
// PGlite stays outside the Bun runner: its WASM runtime affects process hooks.
import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, test } from "node:test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
const migration = readFileSync(
  new URL("../supabase/migrations/20261020034952_add_disabled_sms_outbox.sql", import.meta.url),
  "utf8",
);
const faHash = "a".repeat(64);
const enHash = "b".repeat(64);
let db;
let sequence = 1000;
async function enable() {
  await db.query(
    `update public.sms_delivery_policy set enabled = true, provider_id = 'synthetic',
    fa_template_id = 'receipt-fa-v1', en_template_id = 'receipt-en-v1', fa_terms_hash = $1, en_terms_hash = $2`,
    [faHash, enHash],
  );
}
async function request(options = {}) {
  const id = randomUUID();
  await db.query(
    `insert into public.requests (id, tracking_code, phone_normalized, terms_content_hash, bot_verification, request_type, created_at)
    values ($1, $2, $3, $4, $5, $6, coalesce($7::timestamptz, clock_timestamp()))`,
    [
      id,
      `REQ-${++sequence}`,
      options.phone ?? "+989000000001",
      options.hash ?? faHash,
      options.bot ?? "verified",
      options.type ?? "contact",
      options.created ?? null,
    ],
  );
  return id;
}
async function claim(limit = 5, id = null) {
  const result = await db.query(
    "select public.claim_sms_notifications('synthetic', $1, $2) as value",
    [limit, id],
  );
  return result.rows[0].value;
}
async function authorize(job) {
  return (
    await db.query("select public.authorize_sms_attempt($1, $2, $3) as value", [
      job.request_id,
      job.attempt,
      job.lease_token,
    ])
  ).rows[0].value;
}
async function complete(job, outcome, receipt = null, retry = null) {
  return (
    await db.query("select public.complete_sms_notification($1, $2, $3, $4, $5, $6) as value", [
      job.request_id,
      job.attempt,
      job.lease_token,
      outcome,
      receipt,
      retry,
    ])
  ).rows[0].value;
}
async function state(id) {
  return (
    await db.query(
      "select state, attempt, provider_receipt from public.sms_outbox where request_id = $1",
      [id],
    )
  ).rows[0];
}
describe("SMS outbox real PostgreSQL execution (isolated PGlite fixture, no Supabase/network)", () => {
  before(async () => {
    db = new PGlite();
    // Minimal existing-request boundary, not a replacement of the full Supabase
    // migration chain. Preview still needs real ACL/restore/concurrent workers.
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table public.requests (
        id uuid primary key, tracking_code text not null, phone_normalized text,
        terms_content_hash text not null, bot_verification text not null,
        request_type text not null, status text not null default 'new',
        anonymized_at timestamptz, created_at timestamptz not null default now()
      ); alter table public.requests enable row level security;`);
    await db.exec(migration);
  });
  after(async () => {
    await db?.close();
  });
  beforeEach(async () => {
    await db.exec("begin");
  });
  afterEach(async () => {
    await db.exec("rollback");
  });
  test("default disabled policy allows storing requests and enqueues nothing", async () => {
    await request();
    assert.equal((await db.query("select * from public.sms_outbox")).rows.length, 0);
    assert.deepEqual(await claim(), { code: "DISABLED", items: [] });
  });
  test("activation requires reviewed provider, both templates and distinct accepted locale hashes", async () => {
    await assert.rejects(
      db.exec("update public.sms_delivery_policy set enabled = true"),
      /sms_policy_activation_chk/,
    );
  });
  test("receipt insertion is atomic with its request and rolls back with it", async () => {
    await enable();
    await db.exec("savepoint receipt");
    await request();
    assert.equal((await db.query("select * from public.sms_outbox")).rows.length, 1);
    await db.exec("rollback to savepoint receipt");
    assert.equal((await db.query("select * from public.requests")).rows.length, 0);
    assert.equal((await db.query("select * from public.sms_outbox")).rows.length, 0);
  });
  test("all three services get the same bounded receipt with the accepted FA/EN locale", async () => {
    await enable();
    for (const type of ["grave_stone", "building_stone", "contact"]) {
      const fa = await request({ type });
      const en = await request({ type, hash: enHash });
      assert.equal(
        (await db.query("select locale from public.sms_outbox where request_id = $1", [fa])).rows[0]
          .locale,
        "fa",
      );
      assert.equal(
        (await db.query("select locale from public.sms_outbox where request_id = $1", [en])).rows[0]
          .locale,
        "en",
      );
    }
  });
  test("unknown Terms and unverified submissions never create paid-notification work", async () => {
    await enable();
    await request({ hash: "c".repeat(64) });
    await request({ bot: "unverified_no_token" });
    await request({ bot: "unverified_service_error" });
    assert.equal((await db.query("select * from public.sms_outbox")).rows.length, 0);
  });
  test("replayed insert and later activation never backfill old requests", async () => {
    const old = await request();
    await enable();
    const fresh = await request();
    await db.query(
      "insert into public.requests select * from public.requests where id = $1 on conflict (id) do nothing",
      [fresh],
    );
    assert.equal(
      (await db.query("select * from public.sms_outbox where request_id = $1", [old])).rows.length,
      0,
    );
    assert.equal((await db.query("select * from public.sms_outbox")).rows.length, 1);
  });
  test("claims are bounded and sequential claimers never share a job or attempt reservation", async () => {
    await enable();
    for (let index = 0; index < 8; index++)
      await request({ phone: `+9890000000${index.toString().padStart(2, "0")}` });
    const first = await claim();
    const second = await claim();
    assert.equal(first.items.length, 5);
    assert.equal(second.items.length, 3);
    assert.equal(new Set([...first.items, ...second.items].map((j) => j.request_id)).size, 8);
    assert.equal((await db.query("select * from public.sms_delivery_attempts")).rows.length, 8);
    assert.deepEqual(await claim(6), { code: "INVALID" });
  });
  test("per-phone and global reservations bound spend before any provider call", async () => {
    await enable();
    await request();
    await request();
    assert.equal((await claim()).items.length, 1);
    assert.equal((await claim()).items.length, 0);
    await db.exec("update public.sms_delivery_policy set max_attempts_per_day = 1");
    await request({ phone: "+989000000002" });
    assert.equal((await claim()).items.length, 0);
  });
  test("only the active lease receives the minimal phone/tracking authorization", async () => {
    await enable();
    await request({ hash: enHash });
    const job = (await claim()).items[0];
    assert.deepEqual(await authorize({ ...job, lease_token: randomUUID() }), { code: "STALE" });
    assert.deepEqual(Object.keys(await authorize(job)).sort(), ["code", "phone", "tracking_code"]);
    assert.equal(job.locale, "en");
    assert.equal(job.template_id, "receipt-en-v1");
  });
  test("quota-blocked recipients do not permanently starve later recipients in the bounded scan", async () => {
    await enable();
    for (let index = 0; index < 110; index++) await request();
    const other = await request({ phone: "+989000000002" });
    assert.equal((await claim()).items.length, 1);
    assert.equal((await claim()).items[0].request_id, other);
  });
  test("kill switch cancels already-claimed work before the next send", async () => {
    await enable();
    const id = await request();
    const job = (await claim()).items[0];
    await db.exec("update public.sms_delivery_policy set enabled = false");
    assert.deepEqual(await authorize(job), { code: "CANCELLED" });
    assert.equal((await state(id)).state, "cancelled");
  });
  test("anonymization removes the recipient before sending and no copy remains in the queue", async () => {
    await enable();
    const id = await request();
    const job = (await claim()).items[0];
    await db.query(
      "update public.requests set phone_normalized = null, anonymized_at = clock_timestamp() where id = $1",
      [id],
    );
    assert.deepEqual(await authorize(job), { code: "CANCELLED" });
    const columns = (
      await db.query(
        "select column_name from information_schema.columns where table_name in ('sms_outbox','sms_delivery_attempts')",
      )
    ).rows.map((r) => r.column_name);
    assert.equal(
      columns.some((c) => /phone|name|note|body|credential/.test(c)),
      false,
    );
  });
  test("policy/provider/template changes cannot silently reroute a reserved receipt", async () => {
    await enable();
    const id = await request();
    const job = (await claim()).items[0];
    await db.exec("update public.sms_delivery_policy set provider_id = 'another'");
    assert.deepEqual(await authorize(job), { code: "CANCELLED" });
    assert.equal((await state(id)).state, "cancelled");
  });
  test("provider acceptance is recorded once without claiming handset delivery", async () => {
    await enable();
    const id = await request();
    const job = (await claim()).items[0];
    assert.deepEqual(await complete(job, "accepted", "synthetic-receipt"), { code: "ACCEPTED" });
    assert.deepEqual(await state(id), {
      state: "accepted",
      attempt: 1,
      provider_receipt: "synthetic-receipt",
    });
    assert.deepEqual(await complete(job, "accepted", "synthetic-receipt"), { code: "STALE" });
    assert.equal((await claim()).items.length, 0);
  });
  test("ambiguous send and crashed/expired leases never become automatic retries", async () => {
    await enable();
    const id = await request();
    const job = (await claim()).items[0];
    assert.deepEqual(await complete(job, "uncertain"), { code: "UNCERTAIN" });
    const other = await request({ phone: "+989000000002" });
    const next = (await claim()).items[0];
    await db.query(
      "update public.sms_outbox set lease_until = clock_timestamp() - interval '1 second' where request_id = $1",
      [other],
    );
    assert.equal((await claim()).items.length, 0);
    assert.equal((await state(id)).state, "uncertain");
    assert.equal((await state(other)).state, "uncertain");
    assert.deepEqual(await complete(next, "accepted", "late"), { code: "STALE" });
  });
  test("explicit not-accepted responses retry with delay and stop after attempt three", async () => {
    await enable();
    await db.exec(
      "update public.sms_delivery_policy set max_attempts_per_phone_day = 3, max_attempts_per_phone_hour = 3",
    );
    const id = await request();
    for (let attempt = 1; attempt <= 3; attempt++) {
      const job = (await claim()).items[0];
      assert.equal(job.attempt, attempt);
      assert.deepEqual(await complete(job, "retryable", null, 600), {
        code: attempt === 3 ? "FAILED" : "RETRY_SCHEDULED",
      });
      if (attempt < 3) {
        assert.equal(
          (
            await db.query(
              "select next_attempt_at >= clock_timestamp() + interval '599 seconds' as delayed from public.sms_outbox where request_id = $1",
              [id],
            )
          ).rows[0].delayed,
          true,
        );
        assert.equal((await claim()).items.length, 0);
        await db.query(
          "update public.sms_outbox set next_attempt_at = clock_timestamp() - interval '1 second' where request_id = $1",
          [id],
        );
      }
    }
    assert.equal((await state(id)).state, "failed");
    assert.equal((await claim()).items.length, 0);
  });
  test("malformed completions cannot mark success or schedule an unsafe retry", async () => {
    await enable();
    await request();
    const job = (await claim()).items[0];
    for (const args of [
      ["sent", null, null],
      ["accepted", null, null],
      ["accepted", "bad\nreceipt", null],
      ["uncertain", null, 60],
      ["retryable", null, 86401],
    ]) {
      assert.deepEqual(await complete(job, args[0], args[1], args[2]), { code: "INVALID" });
    }
    assert.deepEqual(await complete({ ...job, lease_token: randomUUID() }, "accepted", "receipt"), {
      code: "STALE",
    });
  });
  test("expired receipts are not sent or revived by recovery", async () => {
    await enable();
    const id = await request({ created: new Date(Date.now() - 25 * 3600_000).toISOString() });
    assert.equal((await claim()).items.length, 0);
    assert.equal((await state(id)).state, "expired");
  });
  test("RLS/ACL deny direct table access and narrow RPCs are service-only", async () => {
    const flags = (
      await db.query(
        "select relrowsecurity, relforcerowsecurity from pg_class where relname in ('sms_delivery_policy','sms_outbox','sms_delivery_attempts')",
      )
    ).rows;
    assert.equal(flags.length, 3);
    assert.ok(flags.every((f) => f.relrowsecurity && f.relforcerowsecurity));
    for (const role of ["anon", "authenticated", "service_role"]) {
      const tables = (
        await db.query(
          "select has_table_privilege($1, 'public.sms_outbox', 'select,insert,update,delete') as allowed",
          [role],
        )
      ).rows[0];
      assert.equal(tables.allowed, false);
      const execute = (
        await db.query(
          "select has_function_privilege($1, 'public.claim_sms_notifications(text,integer,uuid)', 'execute') as allowed",
          [role],
        )
      ).rows[0];
      assert.equal(execute.allowed, role === "service_role");
    }
    await db.exec("set local role service_role");
    assert.deepEqual(await claim(), { code: "DISABLED", items: [] });
  });
  test("deleting the parent removes queue and reservation metadata together", async () => {
    await enable();
    const id = await request();
    await claim();
    await db.query("delete from public.requests where id = $1", [id]);
    assert.equal((await db.query("select * from public.sms_outbox")).rows.length, 0);
    assert.equal((await db.query("select * from public.sms_delivery_attempts")).rows.length, 0);
  });
});
