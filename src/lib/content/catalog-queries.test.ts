import assert from "node:assert/strict";
import { test } from "node:test";
import {
  selectPortfolioItems,
  selectProduct,
  selectProducts,
  validatePortfolioQuery,
  validateProductLookup,
  validateProductQuery,
} from "./catalog-queries";
import type { PortfolioItem, Product } from "./types";

function product(locale: "fa" | "en", slug = "shared-stone"): Product {
  return {
    locale,
    slug,
    id: "product-1",
    code: "STONE-1",
    type: "simple",
    title: locale === "fa" ? "عنوان آزمون" : "Test title",
    summary: null,
    description: null,
    isActive: true,
    isFeatured: true,
    media: [],
    variants: [
      {
        id: "variant-1",
        stoneCode: "granite",
        sizeCode: "120x60",
        priceType: "fixed",
        amountToman: 100_000,
        priceUpdatedAt: "2026-10-11T00:00:00Z",
        isAvailable: true,
        includes: [locale === "fa" ? "قلم‌زنی" : "Engraving"],
        excludes: [],
        options: [
          {
            id: "option-1",
            title: locale === "fa" ? "گزینهٔ آزمون" : "Test option",
            priceType: "estimate",
            amountToman: 20_000,
            priceUpdatedAt: "2026-10-11T00:00:00Z",
            isAvailable: true,
            compatibleSizeCodes: ["120x60"],
          },
        ],
      },
    ],
    seo: null,
    updatedAt: "2026-10-11T00:00:00Z",
  };
}

test("shared product slugs resolve the requested translation in either source order", () => {
  const fa = product("fa");
  const en = product("en");
  for (const items of [
    [fa, en],
    [en, fa],
  ]) {
    assert.equal(selectProduct(items, fa.slug, "en"), en);
    assert.equal(selectProduct(items, fa.slug, "fa"), fa);
    assert.equal(selectProduct(items, fa.slug), fa);
    assert.equal(selectProduct(items, "missing", "en"), null);
  }
});

test("missing translations and inactive products never fall back to the other locale", () => {
  const fa = product("fa");
  const en = { ...product("en"), isActive: false };
  assert.equal(selectProduct([fa, en], fa.slug, "en"), null);
  assert.deepEqual(selectProducts([fa, en], { locale: "en" }), []);
  assert.equal(selectProduct([en], en.slug, "fa"), null);
  assert.equal(selectProduct([en, product("en")], en.slug, "en")?.isActive, true);
});

test("legacy unlabelled content is Persian while invalid content locale labels are hidden", () => {
  const { locale: _locale, ...legacy } = product("fa");
  assert.equal(selectProduct([legacy], legacy.slug, "fa"), legacy);
  assert.equal(selectProduct([legacy], legacy.slug, "en"), null);
  for (const locale of ["de", "", "EN", "fa-IR"]) {
    const malformed = { ...legacy, locale };
    for (const target of ["fa", "en"] as const) {
      assert.equal(selectProduct([malformed], legacy.slug, target), null);
      assert.deepEqual(selectProducts([malformed], { locale: target }), []);
    }
  }
});

test("product locale filtering precedes the list limit even when Persian entries come first", () => {
  const first = product("en", "first");
  const second = product("en", "second");
  const items = [product("fa"), product("fa", "another"), first, second];
  assert.deepEqual(selectProducts(items, { locale: "en", limit: 1 }), [first]);
  assert.deepEqual(selectProducts(items, { locale: "en", limit: 2 }), [first, second]);
});

test("language queries retain product type, featured and available-size filters", () => {
  const active = product("en");
  const unavailable = {
    ...active,
    slug: "unavailable",
    variants: [{ ...active.variants[0]!, isAvailable: false }],
  };
  const unfeatured = { ...active, slug: "unfeatured", isFeatured: false };
  const boxed = { ...active, slug: "boxed", type: "cnc_box" as const };
  const items = [product("fa"), unavailable, unfeatured, boxed, active];
  assert.deepEqual(
    selectProducts(items, { locale: "en", type: "simple", featuredOnly: true, sizeCode: "120x60" }),
    [active],
  );
  assert.deepEqual(selectProducts(items, { locale: "en", sizeCode: "180x60" }), []);
  assert.deepEqual(selectProducts(items, { locale: "en", type: "cnc_box" }), [boxed]);
});

test("translation selection does not mutate operational identifiers, amounts or availability", () => {
  const en = product("en");
  const items = [product("fa"), en];
  const before = JSON.stringify(items);
  const selected = selectProduct(items, en.slug, "en")!;
  assert.equal(selected, en);
  assert.equal(selectProducts(items, { locale: "en" })[0]?.variants, en.variants);
  assert.deepEqual(
    [
      selected.id,
      selected.code,
      selected.variants[0]?.id,
      selected.variants[0]?.options[0]?.id,
      selected.variants[0]?.amountToman,
      selected.variants[0]?.options[0]?.amountToman,
      selected.variants[0]?.isAvailable,
    ],
    ["product-1", "STONE-1", "variant-1", "option-1", 100_000, 20_000, true],
  );
  assert.equal(JSON.stringify(items), before);
});

test("portfolio language filtering precedes its limit and preserves public references", () => {
  const fa: PortfolioItem = { locale: "fa", publicReferenceId: "pf-1001", media: [] };
  const en: PortfolioItem = { locale: "en", publicReferenceId: "pf-1001", media: [] };
  const second = { ...en, publicReferenceId: "pf-1002" };
  const items = [fa, { ...fa, locale: "unknown" }, en, second];
  assert.deepEqual(selectPortfolioItems(items, { locale: "en", limit: 1 }), [en]);
  assert.deepEqual(selectPortfolioItems(items), [fa]);
  assert.deepEqual(selectPortfolioItems([second, en], { locale: "en" }), [second, en]);
});

test("an ambiguous active translation fails instead of silently choosing one record", () => {
  const en = product("en");
  assert.throws(() => selectProduct([en, { ...en, title: "Different" }], en.slug, "en"), {
    message: "Ambiguous product translation",
  });
  assert.equal(selectProduct([en, { ...en, isActive: false }], en.slug, "en"), en);
});

test("all catalog server inputs validate locale and include it in normalized request data", () => {
  assert.deepEqual(validateProductQuery(undefined), { locale: "fa" });
  assert.deepEqual(validatePortfolioQuery(undefined), { locale: "fa" });
  assert.deepEqual(validateProductLookup({ slug: "stone" }), { slug: "stone", locale: "fa" });
  for (const locale of ["fa", "en"]) {
    assert.deepEqual(validateProductQuery({ locale, limit: 2 }), { locale, limit: 2 });
    assert.deepEqual(validatePortfolioQuery({ locale }), { locale });
    assert.deepEqual(validateProductLookup({ slug: "stone", locale }), { slug: "stone", locale });
  }
  for (const locale of ["EN", "fa-IR", "de", "", true, 1, [], {}]) {
    assert.throws(() => validateProductQuery({ locale }), { message: "Invalid content locale" });
    assert.throws(() => validatePortfolioQuery({ locale }), { message: "Invalid content locale" });
    assert.throws(() => validateProductLookup({ slug: "stone", locale }), {
      message: "Invalid content locale",
    });
  }
});

test("query validation keeps existing limit, type, size and feature restrictions", () => {
  assert.deepEqual(
    validateProductQuery({
      locale: "en",
      type: "simple",
      featuredOnly: false,
      sizeCode: "120x60",
      limit: 100,
      privateField: "synthetic-private-value",
    }),
    { locale: "en", type: "simple", featuredOnly: false, sizeCode: "120x60", limit: 100 },
  );
  for (const limit of [0, -1, 101, 1.1, "1", NaN, Infinity, [], {}]) {
    assert.throws(() => validateProductQuery({ limit }));
    assert.throws(() => validatePortfolioQuery({ limit }));
  }
  for (const input of [[], "private", 1, false]) {
    assert.throws(() => validateProductQuery(input));
    assert.throws(() => validatePortfolioQuery(input));
    assert.throws(() => validateProductLookup(input));
  }
  for (const bad of [{ type: "building" }, { sizeCode: "unknown" }, { featuredOnly: "true" }]) {
    assert.throws(() => validateProductQuery(bad));
  }
  for (const slug of [
    "../private",
    "/en/stone",
    "",
    "Stone",
    "stone?name=synthetic-private-value",
  ]) {
    assert.throws(() => validateProductLookup({ slug }), { message: "Invalid product slug" });
  }
});
