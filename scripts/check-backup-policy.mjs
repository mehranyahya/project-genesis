import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const manifest = readFileSync(new URL("./supabase-restore-manifest.sql", import.meta.url), "utf8");
const marker = "$manifest_checks$;";
const prefix = manifest.slice(0, manifest.indexOf(marker) + marker.length);
const closeSql = readFileSync(new URL("./close-restored-requests.sql", import.meta.url), "utf8");

async function fixture(enabled = true) {
  const db = await PGlite.create();
  // Only the manifest's initial SQL guards are under test. Unrelated RPCs and
  // digest have inert signatures; this is not a full Supabase restore drill.
  await db.exec(`
    create schema extensions;
    create function extensions.digest(bytea,text) returns bytea language sql as 'select $1';
    create schema supabase_migrations;
    create table supabase_migrations.schema_migrations(version text);
    insert into supabase_migrations.schema_migrations select i::text from generate_series(1,11) i;
    create table public.request_rate_limit_policy(id text, enabled boolean);
    alter table public.request_rate_limit_policy enable row level security;
  `);
  for (const name of [
    "claim_gateway_nonce",
    "claim_telegram_notifications",
    "complete_telegram_notification",
    "compute_operational_catalog_version",
    "create_request_atomic",
    "create_request_atomic_storage",
    "inspect_request_idempotency",
    "requests_before_update",
    "touch_updated_at",
  ]) {
    await db.exec(`create function public.${name}() returns integer language sql as 'select 1';`);
  }
  await db.query("insert into public.request_rate_limit_policy values ('primary',$1)", [enabled]);
  return db;
}

for (const enabled of [true, false]) {
  test(`source policy ${enabled} passes actual manifest guards in a read-only transaction`, async () => {
    const db = await fixture(enabled);
    try {
      assert.match(prefix, /^begin read only;/m);
      await db.exec(prefix);
      assert.equal(
        (await db.query("select enabled from public.request_rate_limit_policy")).rows[0].enabled,
        enabled,
      );
      await assert.rejects(
        db.exec("update public.request_rate_limit_policy set enabled = not enabled"),
        /read.only/i,
      );
      await db.exec("rollback");
      assert.equal(
        (await db.query("select enabled from public.request_rate_limit_policy")).rows[0].enabled,
        enabled,
      );
    } finally {
      await db.close();
    }
  });
}

test("missing, extra, unknown and null source policy states fail the actual SQL guard", async () => {
  const db = await fixture();
  try {
    for (const values of [
      "",
      "('primary',true),('other',false)",
      "('other',true)",
      "('primary',null)",
    ]) {
      await db.exec("delete from public.request_rate_limit_policy");
      if (values) await db.exec(`insert into public.request_rate_limit_policy values ${values}`);
      await assert.rejects(db.exec(prefix), /request rate limit policy/);
      await db.exec("rollback");
    }
  } finally {
    await db.close();
  }
});

test("the exact restored-copy SQL closes a clone while the source remains enabled", async () => {
  const source = await fixture(true);
  const restored = await fixture(true);
  try {
    assert.ok(closeSql, "restore-close SQL is required");
    await restored.exec(closeSql);
    assert.equal(
      (await restored.query("select enabled from public.request_rate_limit_policy")).rows[0]
        .enabled,
      false,
    );
    assert.equal(
      (await source.query("select enabled from public.request_rate_limit_policy")).rows[0].enabled,
      true,
    );
    await restored.exec(prefix);
    await restored.exec("rollback");
  } finally {
    await source.close();
    await restored.close();
  }
});

test("restored-copy closure rejects a missing or extra policy record", async () => {
  const db = await fixture();
  try {
    assert.ok(closeSql, "restore-close SQL is required");
    await db.exec("delete from public.request_rate_limit_policy");
    await assert.rejects(db.exec(closeSql), /restored request policy is not closed/);
    await db.exec(
      "insert into public.request_rate_limit_policy values ('primary',true),('other',true)",
    );
    await assert.rejects(db.exec(closeSql), /restored request policy is not closed/);
  } finally {
    await db.close();
  }
});
