import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import * as adapters from "./adapters";
import { PAGE_SLUGS } from "./types";

const ADAPTER_NAMES = [
  "getProducts",
  "getProduct",
  "getPortfolioItems",
  "getGuides",
  "getGuide",
  "getSite",
  "getPage",
  "getCatalogVersion",
] as const;

const typesSource = readFileSync(new URL("./types.ts", import.meta.url), "utf8");

const hasField = (block: string, field: string) =>
  new RegExp(`^\\s+${field}\\??:`, "m").test(block);

const interfaceBlock = (name: string): string => {
  const match = typesSource.match(
    new RegExp(`export interface ${name}(?: extends [A-Za-z]+)? \\{([\\s\\S]*?)\\n\\}`),
  );
  const body = match?.[1];
  assert.ok(body, `interface ${name} not found`);
  return body;
};

test("all eight content adapters exist", () => {
  for (const name of ADAPTER_NAMES) {
    assert.equal(typeof (adapters as Record<string, unknown>)[name], "function");
  }
});

test("list adapters default to empty arrays, with and without a query", async () => {
  assert.deepEqual(await adapters.getProducts(), []);
  assert.deepEqual(await adapters.getProducts({ featuredOnly: true, limit: 3 }), []);
  assert.deepEqual(await adapters.getPortfolioItems(), []);
  assert.deepEqual(await adapters.getPortfolioItems({ limit: 3 }), []);
  assert.deepEqual(await adapters.getGuides(), []);
  assert.deepEqual(await adapters.getGuides({ limit: 3 }), []);
});

test("single-entity adapters default to null", async () => {
  assert.equal(await adapters.getProduct("any"), null);
  assert.equal(await adapters.getGuide("any"), null);
  assert.equal(await adapters.getSite(), null);
  assert.equal(await adapters.getPage("home"), null);
  assert.equal(await adapters.getCatalogVersion(), null);
});

test("adapters import no fixtures or content files at runtime", async () => {
  const source = readFileSync(new URL("./adapters.ts", import.meta.url), "utf8");
  const imports = source.match(/^import .*$/gm) ?? [];
  for (const line of imports) {
    assert.ok(
      line.includes('from "./types"') || line.startsWith("import type"),
      `unexpected runtime import: ${line}`,
    );
  }
  assert.equal(/\.json|fixture|content\//i.test(source), false);
});

test("page slug allowlist is exactly the contract", () => {
  assert.deepEqual([...PAGE_SLUGS].sort(), [
    "about",
    "building-stone",
    "contact",
    "home",
    "not-found",
    "privacy",
    "terms",
  ]);
});

test("price contract is fixed | estimate | review", () => {
  assert.match(typesSource, /export type PriceType =\s*"fixed" \| "estimate" \| "review";/);
});

test("Product carries every required field", () => {
  const block = interfaceBlock("Product");
  for (const field of [
    "id",
    "code",
    "slug",
    "type",
    "title",
    "summary",
    "description",
    "isActive",
    "isFeatured",
    "media",
    "variants",
    "seo",
    "updatedAt",
  ]) {
    assert.ok(hasField(block, field), `Product missing ${field}`);
  }
});

test("Variant carries every required field", () => {
  const block = interfaceBlock("ProductVariant");
  for (const field of [
    "id",
    "stoneCode",
    "sizeCode",
    "priceType",
    "amountToman",
    "priceUpdatedAt",
    "includes",
    "excludes",
    "options",
    "isAvailable",
  ]) {
    assert.ok(hasField(block, field), `ProductVariant missing ${field}`);
  }
});

test("Option carries every required field", () => {
  const block = interfaceBlock("ProductOption");
  for (const field of [
    "id",
    "title",
    "priceType",
    "amountToman",
    "priceUpdatedAt",
    "isAvailable",
    "compatibleSizeCodes",
  ]) {
    assert.ok(hasField(block, field), `ProductOption missing ${field}`);
  }
});

test("Media is privacy-aware", () => {
  const block = interfaceBlock("Media");
  for (const field of ["mediaKey", "alt", "caption", "privacyCleared", "consentReference"]) {
    assert.ok(hasField(block, field), `Media missing ${field}`);
  }
});

test("Portfolio exposes only a public reference and safe media", () => {
  const block = interfaceBlock("PortfolioItem");
  assert.ok(hasField(block, "publicReferenceId"));
  assert.ok(hasField(block, "media"));
  assert.equal(/customer|phone|name/i.test(block), false);
});

test("Site carries public contact channels", () => {
  const block = interfaceBlock("Site");
  for (const field of [
    "displayName",
    "latinName",
    "phone",
    "whatsapp",
    "telegram",
    "address",
    "workingHours",
    "links",
  ]) {
    assert.ok(hasField(block, field), `Site missing ${field}`);
  }
});

test("Guide and SEO meta are typed", () => {
  const guide = interfaceBlock("Guide");
  for (const field of ["slug", "title", "summary", "body", "seo", "updatedAt"]) {
    assert.ok(hasField(guide, field), `Guide missing ${field}`);
  }
  const seo = interfaceBlock("SeoMeta");
  for (const field of ["title", "description", "canonicalPath", "robots"]) {
    assert.ok(hasField(seo, field), `SeoMeta missing ${field}`);
  }
});

test("catalog version is documented as a 64-char lowercase sha-256", () => {
  assert.match(typesSource, /64-character SHA-256/i);
  assert.match(typesSource, /export type CatalogVersion = string;/);
});
