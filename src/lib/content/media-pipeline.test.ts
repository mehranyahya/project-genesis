import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { toAvifSrcSet } from "@/components/media/public-media";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const PIPELINE = read("../../../scripts/generate-structured-content.mjs");
const MIGRATION = read(
  "../../../supabase/migrations/20260811023000_secure_catalog_media_and_whatsapp_url.sql",
);
const TYPES = read("./types.ts");
const RUNTIME_REPOSITORY = read("./supabase.server.ts");
const DEPLOY = read("../../../.github/workflows/deploy-cloudflare-reusable.yml");
const WORKER_SECRET_WRITER = read("../../../scripts/write-cloudflare-secrets.mjs");

test("private bucket is non-public and limited to raster image MIME types", () => {
  assert.match(MIGRATION, /'catalog-media'/);
  assert.match(MIGRATION, /false,\s*20971520/);
  for (const mime of ["image/jpeg", "image/png", "image/webp", "image/avif"]) {
    assert.ok(MIGRATION.includes(`'${mime}'`));
  }
  assert.doesNotMatch(MIGRATION, /image\/svg\+xml|text\/html/);
  assert.doesNotMatch(MIGRATION, /create\s+policy/i);
});

test("every publication-cleared media table requires a private consent reference", () => {
  for (const table of ["product_media", "portfolio_media", "building_stone_media"]) {
    assert.match(MIGRATION, new RegExp(`ALTER TABLE public\\.${table}`));
    assert.match(MIGRATION, new RegExp(`${table}_publication_consent_chk`));
  }
  assert.match(MIGRATION, /privacy_cleared IS NOT TRUE/);
  assert.match(MIGRATION, /NULLIF\(BTRIM\(consent_reference\), ''\) IS NOT NULL/);
});

test("build pipeline validates bytes, MIME, decoded limits, aspect and privacy", () => {
  for (const contract of [
    "MAX_SOURCE_BYTES",
    "MAX_SOURCE_PIXELS",
    "MIN_SOURCE_WIDTH",
    "detectMagic",
    "looksLikeMarkup",
    "declaredMime !== magic.mime",
    "approximately 4:5 portrait",
    "privacy_cleared",
    "consent_reference",
  ]) {
    assert.ok(PIPELINE.includes(contract), `missing ${contract}`);
  }
  assert.ok(PIPELINE.includes("Animated or multi-page media is not allowed"));
});

test("WebP and AVIF outputs are responsive, hash-named and metadata-free", () => {
  for (const width of [320, 640, 1280]) assert.ok(PIPELINE.includes(String(width)));
  assert.match(PIPELINE, /\.webp\(/);
  assert.match(PIPELINE, /\.avif\(/);
  assert.match(PIPELINE, /createHash\("sha256"\)/);
  assert.match(PIPELINE, /metadata\.exif \|\| metadata\.xmp \|\| metadata\.iptc/);
  assert.doesNotMatch(PIPELINE, /withMetadata|keepMetadata/);
});

test("public Media DTO has exactly five required fields", () => {
  const block = /export interface Media \{([\s\S]*?)\n\}/.exec(TYPES)?.[1] ?? "";
  for (const field of ["src", "srcSet", "width", "height", "alt"]) {
    assert.match(block, new RegExp(`\\b${field}:`));
  }
  for (const privateField of ["mediaKey", "privacyCleared", "consentReference", "caption"]) {
    assert.doesNotMatch(block, new RegExp(privateField));
  }
});

test("runtime repository cannot access Supabase or private Storage", () => {
  assert.match(RUNTIME_REPOSITORY, /generated-structured-content/);
  assert.doesNotMatch(
    RUNTIME_REPOSITORY,
    /process\.env|fetch\(|SUPABASE_SERVICE_ROLE_KEY|BUILD_SUPABASE|\/storage\/v1|\/rest\/v1/i,
  );
});

test("build service role is scoped to generation and never written into Worker secrets", () => {
  assert.match(DEPLOY, /BUILD_SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(DEPLOY, /Generate sanitized structured content and media/);
  assert.doesNotMatch(WORKER_SECRET_WRITER, /BUILD_SUPABASE|SERVICE_ROLE/i);
});

test("AVIF candidates are deterministically derived from same-origin WebP srcSet", () => {
  const webp =
    "/media/aaaaaaaaaaaaaaaaaaaaaaaa/bbbbbbbbbbbbbbbb-320w.webp 320w, /media/aaaaaaaaaaaaaaaaaaaaaaaa/bbbbbbbbbbbbbbbb-640w.webp 640w, /media/aaaaaaaaaaaaaaaaaaaaaaaa/bbbbbbbbbbbbbbbb-1280w.webp 1280w";
  const avif = toAvifSrcSet(webp);
  assert.equal(avif.split(",").length, 3);
  assert.ok(avif.includes("-320w.avif 320w"));
  assert.ok(avif.includes("-640w.avif 640w"));
  assert.ok(avif.includes("-1280w.avif 1280w"));
  assert.equal(avif.includes("webp"), false);
  assert.equal(toAvifSrcSet("https://evil.example/a.webp 320w"), "");
});

test("WhatsApp storage contract is explicit HTTPS whatsapp_url", () => {
  assert.match(MIGRATION, /RENAME COLUMN whatsapp TO whatsapp_url/);
  assert.match(MIGRATION, /\^https:\/\//);
  assert.match(MIGRATION, /wa\\\.me/);
  assert.match(MIGRATION, /api\\\.whatsapp\\\.com/);
  assert.doesNotMatch(MIGRATION, /http:\/\//);
});

test("only route-level LCP candidates opt into high priority", () => {
  const hero = read("../../components/home/home-hero.tsx");
  const product = read("../../components/product/product-media-stage.tsx");
  const graveCard = read("../../components/grave-stones/grave-stone-card.tsx");
  const portfolio = read("../../components/portfolio/portfolio-card.tsx");
  assert.match(hero, /\bpriority\b/);
  assert.match(product, /priority=\{index === 0\}/);
  assert.doesNotMatch(graveCard, /\bpriority\b/);
  assert.doesNotMatch(portfolio, /\bpriority\b/);
});

test("home hero uses a seven/five desktop split", () => {
  const hero = read("../../components/home/home-hero.tsx");
  assert.match(hero, /lg:col-span-7/);
  assert.match(hero, /lg:col-span-5/);
});
