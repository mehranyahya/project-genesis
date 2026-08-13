import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildSitemapXml,
  FIXED_SITEMAP_PATHS,
  handleSitemapRequest,
  normalizeSiteUrl,
  type SitemapProduct,
} from "./sitemap.server";
import { BASE_STATIC_PATHS, LOCALES, localizeRawPath } from "./i18n/locale";

const origin = "https://example.com";
const products: SitemapProduct[] = [
  {
    slug: "natanz-simple",
    updatedAt: "2026-08-08T01:02:03.000Z",
    isActive: true,
  },
  {
    slug: "hidden-product",
    updatedAt: "2026-08-08T01:02:03.000Z",
    isActive: false,
  },
  {
    slug: "INVALID SLUG",
    updatedAt: "2026-08-08T01:02:03.000Z",
    isActive: true,
  },
];

test("SITE_URL accepts only a clean HTTPS origin", () => {
  assert.equal(normalizeSiteUrl("https://example.com"), origin);
  assert.equal(normalizeSiteUrl("https://example.com/"), origin);

  for (const invalid of [
    "http://example.com",
    "https://user@example.com",
    "https://example.com/path",
    "https://example.com/?query=1",
    "https://example.com/#hash",
    "not-a-url",
  ]) {
    assert.throws(() => normalizeSiteUrl(invalid));
  }
});

test("sitemap contains fixed public routes and active validated product routes only", () => {
  const xml = buildSitemapXml(origin, products);

  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  const expectedFixedPaths = BASE_STATIC_PATHS.flatMap((path) =>
    LOCALES.map((locale) => localizeRawPath(path, locale)),
  );
  assert.deepEqual([...FIXED_SITEMAP_PATHS].sort(), expectedFixedPaths.sort());
  for (const path of expectedFixedPaths) {
    assert.ok(xml.includes(`<loc>${new URL(path, `${origin}/`).toString()}</loc>`), path);
  }
  assert.match(xml, /<loc>https:\/\/example\.com\/grave-stones\/natanz-simple<\/loc>/);
  assert.match(xml, /<loc>https:\/\/example\.com\/en\/grave-stones\/natanz-simple<\/loc>/);
  assert.match(xml, /<lastmod>2026-08-08T01:02:03\.000Z<\/lastmod>/);
  assert.equal(xml.includes("hidden-product"), false);
  assert.equal(xml.includes("INVALID"), false);
  assert.equal(xml.includes("/api/"), false);
});

test("preview sitemap fails closed without loading operational content", async () => {
  let loads = 0;
  const response = await handleSitemapRequest(
    new Request("https://preview.example/sitemap.xml"),
    { PUBLIC_INDEXING: "false", SITE_URL: "https://preview.example" },
    {
      loadProducts: async () => {
        loads += 1;
        return products;
      },
    },
  );

  assert.ok(response);
  assert.equal(response.status, 404);
  assert.equal(loads, 0);
});

test("production sitemap requires SITE_URL", async () => {
  const response = await handleSitemapRequest(
    new Request("https://worker.example/sitemap.xml"),
    { PUBLIC_INDEXING: "true" },
    { loadProducts: async () => products },
  );

  assert.ok(response);
  assert.equal(response.status, 503);
});

test("production sitemap emits XML using SITE_URL rather than request host", async () => {
  const response = await handleSitemapRequest(
    new Request("https://worker-preview-host.example/sitemap.xml"),
    { PUBLIC_INDEXING: "true", SITE_URL: origin },
    { loadProducts: async () => products },
  );

  assert.ok(response);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/xml; charset=utf-8");
  const xml = await response.text();
  assert.ok(xml.includes("https://example.com/grave-stones/natanz-simple"));
  assert.equal(xml.includes("worker-preview-host.example"), false);
});

test("non-sitemap requests are ignored by the Worker sitemap handler", async () => {
  assert.equal(
    await handleSitemapRequest(new Request("https://example.com/about"), {
      PUBLIC_INDEXING: "true",
      SITE_URL: origin,
    }),
    null,
  );
  assert.equal(
    await handleSitemapRequest(new Request("https://example.com/sitemap.xml", { method: "POST" }), {
      PUBLIC_INDEXING: "true",
      SITE_URL: origin,
    }),
    null,
  );
});
