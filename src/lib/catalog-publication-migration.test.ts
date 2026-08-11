import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260811062754_secure_catalog_media_and_whatsapp_url.sql",
    import.meta.url,
  ),
  "utf8",
);
const headers = readFileSync(new URL("../../public/_headers", import.meta.url), "utf8");
const buildScript = readFileSync(
  new URL("../../scripts/build-catalog.mjs", import.meta.url),
  "utf8",
);

test("catalog media bucket is private, bounded and has no browser-role storage policy", () => {
  assert.match(migration, /'catalog-media'[\s\S]*false[\s\S]*20971520/);
  for (const type of ["image/jpeg", "image/png", "image/webp", "image/avif"]) {
    assert.ok(migration.includes(`'${type}'`));
  }
  assert.doesNotMatch(migration, /create\s+policy|to\s+(anon|authenticated)\b/i);
});

test("publication source version covers catalog rows and private object metadata", () => {
  assert.match(migration, /compute_catalog_publication_source_version/);
  for (const source of [
    "public.products",
    "public.product_variants",
    "public.product_options",
    "public.product_media",
    "public.portfolio_items",
    "public.portfolio_media",
    "public.site_settings",
    "storage.objects",
  ]) {
    assert.ok(migration.includes(source), `missing publication source ${source}`);
  }
  assert.match(
    migration,
    /revoke all on function public\.compute_catalog_publication_source_version\(\)[\s\S]*from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.compute_catalog_publication_source_version\(\)[\s\S]*to service_role/,
  );
  assert.ok(buildScript.includes("assertStablePublicationSourceVersion"));
  assert.doesNotMatch(migration, /last_accessed_at/);
});

test("WhatsApp publication requires a reviewed canonical HTTPS URL", () => {
  assert.match(migration, /add column whatsapp_url text null/);
  assert.match(migration, /\^https:\/\/wa\\\.\[m\]e\/\[1-9\]\[0-9\]\{7,15\}\$/);
  assert.match(migration, /never inferred from a phone number at runtime/);
});

test("immutable cache headers apply only to generated hash-addressed media", () => {
  assert.match(headers, /^\/media\/catalog\/\*/m);
  assert.match(headers, /Cache-Control: public, max-age=31556952, immutable/);
  assert.match(headers, /X-Content-Type-Options: nosniff/);
  assert.doesNotMatch(headers, /^\/\*\s*$/m);
});
