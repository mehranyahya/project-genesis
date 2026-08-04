import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import * as adapters from "./adapters";
import { CATALOG_VERSION_PATTERN, PAGE_SLUGS, isCatalogVersion } from "./types";
import type {
  CatalogVersion,
  Media,
  PriceType,
  Product,
  ProductOption,
  ProductType,
  ProductVariant,
  Guide,
  PortfolioItem,
  SeoMeta,
  Site,
} from "./types";

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

/* ------------------------------------------------------------------ *
 * Type-level assertions. These are enforced by `tsc --noEmit`,
 * not by regex over source text.
 * ------------------------------------------------------------------ */

type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;
type RequiredKeys<T> = {
  [K in keyof T]-?: object extends Pick<T, K> ? never : K;
}[keyof T];
type OptionalKeys<T> = {
  [K in keyof T]-?: object extends Pick<T, K> ? K : never;
}[keyof T];

type _ProductTypeUnion = Expect<Equals<ProductType, "simple" | "cnc_box">>;
type _PriceTypeUnion = Expect<Equals<PriceType, "fixed" | "estimate" | "review">>;

type _ProductRequired = Expect<
  Equals<
    RequiredKeys<Product>,
    | "id"
    | "code"
    | "slug"
    | "type"
    | "title"
    | "summary"
    | "description"
    | "isActive"
    | "isFeatured"
    | "media"
    | "variants"
    | "seo"
    | "updatedAt"
  >
>;

type _VariantRequired = Expect<
  Equals<
    RequiredKeys<ProductVariant>,
    | "id"
    | "stoneCode"
    | "sizeCode"
    | "priceType"
    | "amountToman"
    | "priceUpdatedAt"
    | "includes"
    | "excludes"
    | "options"
    | "isAvailable"
  >
>;

type _OptionRequired = Expect<
  Equals<
    RequiredKeys<ProductOption>,
    | "id"
    | "title"
    | "priceType"
    | "amountToman"
    | "priceUpdatedAt"
    | "isAvailable"
    | "compatibleSizeCodes"
  >
>;

type _SiteRequired = Expect<
  Equals<
    RequiredKeys<Site>,
    | "displayName"
    | "latinName"
    | "phone"
    | "whatsapp"
    | "telegram"
    | "address"
    | "workingHours"
    | "links"
  >
>;

type _SeoRequired = Expect<
  Equals<RequiredKeys<SeoMeta>, "title" | "description" | "canonicalPath" | "robots">
>;

type _MediaRequired = Expect<
  Equals<
    RequiredKeys<Media>,
    "mediaKey" | "alt" | "caption" | "privacyCleared" | "consentReference"
  >
>;
type _MediaOptional = Expect<Equals<OptionalKeys<Media>, "width" | "height">>;

type _GuideRequired = Expect<
  Equals<RequiredKeys<Guide>, "slug" | "title" | "summary" | "body" | "seo" | "updatedAt">
>;

type _PortfolioRequired = Expect<
  Equals<RequiredKeys<PortfolioItem>, "publicReferenceId" | "media">
>;

// Portfolio exposes no customer-identifying surface.
type _PortfolioNoPii = Expect<
  Equals<Extract<keyof PortfolioItem, `${string}customer${string}` | "name" | "phone">, never>
>;

// CatalogVersion is branded: a plain string is not assignable to it.
type _BrandedCatalogVersion = Expect<Equals<string extends CatalogVersion ? true : false, false>>;

test("type-level contract assertions compile", () => {
  const checks: true[] = [
    true as _ProductTypeUnion,
    true as _PriceTypeUnion,
    true as _ProductRequired,
    true as _VariantRequired,
    true as _OptionRequired,
    true as _SiteRequired,
    true as _SeoRequired,
    true as _MediaRequired,
    true as _MediaOptional,
    true as _GuideRequired,
    true as _PortfolioRequired,
    true as _PortfolioNoPii,
    true as _BrandedCatalogVersion,
  ];
  assert.equal(
    checks.every((value) => value === true),
    true,
  );
});

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

test("catalog version predicate accepts only 64 lowercase hex characters", () => {
  assert.equal(CATALOG_VERSION_PATTERN.source, "^[0-9a-f]{64}$");
  const valid = "a".repeat(64);
  assert.equal(isCatalogVersion(valid), true);
  assert.equal(isCatalogVersion("0123456789abcdef".repeat(4)), true);
  assert.equal(isCatalogVersion("a".repeat(63)), false);
  assert.equal(isCatalogVersion("a".repeat(65)), false);
  assert.equal(isCatalogVersion("A".repeat(64)), false);
  assert.equal(isCatalogVersion(`${"a".repeat(63)}g`), false);
  assert.equal(isCatalogVersion(`sha256:${valid}`), false);
  assert.equal(isCatalogVersion(""), false);
  assert.equal(isCatalogVersion(` ${valid} `), false);
});
