import { test } from "node:test";
import assert from "node:assert/strict";

import type { Product, ProductOption, ProductVariant } from "../lib/content/types";
import {
  PRODUCT_SIZE_ORDER,
  buildProductDetailModel,
  normalizePriceDate,
  resolveSelectionPrice,
} from "../lib/product-detail";

const option = (over: Partial<ProductOption> = {}): ProductOption => ({
  id: "opt-1",
  title: "گزینه",
  priceType: "fixed",
  amountToman: 100_000,
  priceUpdatedAt: "2026-01-02",
  isAvailable: true,
  compatibleSizeCodes: ["120x60"],
  ...over,
});

const variant = (over: Partial<ProductVariant> = {}): ProductVariant => ({
  id: "v-1",
  stoneCode: "MA-1001",
  sizeCode: "120x60",
  priceType: "fixed",
  amountToman: 1_000_000,
  priceUpdatedAt: "2026-01-01",
  includes: ["حکاکی"],
  excludes: ["نصب"],
  options: [],
  isAvailable: true,
  ...over,
});

const product = (over: Partial<Product> = {}): Product => ({
  id: "p-1",
  code: "C-1",
  slug: "sang-1",
  type: "simple",
  title: "سنگ نمونه",
  summary: null,
  description: null,
  isActive: true,
  isFeatured: false,
  media: [],
  variants: [variant()],
  seo: null,
  updatedAt: "2026-07-07",
  ...over,
});

const build = (over: Partial<Product> = {}, slug = "sang-1") =>
  buildProductDetailModel(product(over), slug);

test("1 null product yields a null model", () => {
  assert.equal(buildProductDetailModel(null, "sang-1"), null);
});

test("2 inactive product yields a null model", () => {
  assert.equal(build({ isActive: false }), null);
});

test("3 blank id, code, slug or title yields a null model", () => {
  assert.equal(build({ id: "  " }), null);
  assert.equal(build({ code: "" }), null);
  assert.equal(build({ slug: "   " }), null);
  assert.equal(build({ title: " " }), null);
});

test("4 slug mismatch yields a null model", () => {
  assert.equal(build({}, "other-slug"), null);
});

test("5 product without an available variant yields a null model", () => {
  assert.equal(build({ variants: [variant({ isAvailable: false })] }), null);
});

test("6 unavailable variants are dropped", () => {
  const model = build({
    variants: [variant({ id: "a" }), variant({ id: "b", isAvailable: false })],
  });
  assert.deepEqual(model?.variants.map((item) => item.id), ["a"]);
});

test("7 variants with blank id or stone code are dropped", () => {
  const model = build({
    variants: [variant({ id: "  " }), variant({ id: "b", stoneCode: " " }), variant({ id: "c" })],
  });
  assert.deepEqual(model?.variants.map((item) => item.id), ["c"]);
});

test("8 size order is exactly the locked M5 order", () => {
  assert.deepEqual([...PRODUCT_SIZE_ORDER], ["120x60", "160x60", "180x60", "custom"]);
  const model = build({
    variants: [
      variant({ id: "custom", sizeCode: "custom" }),
      variant({ id: "c", sizeCode: "180x60" }),
      variant({ id: "b", sizeCode: "160x60" }),
      variant({ id: "a", sizeCode: "120x60" }),
    ],
  });
  assert.deepEqual(model?.variants.map((item) => item.sizeCode), [
    "120x60",
    "160x60",
    "180x60",
    "custom",
  ]);
});

test("9 adapter order is preserved inside a size", () => {
  const model = build({
    variants: [
      variant({ id: "a2", stoneCode: "S2" }),
      variant({ id: "b1", sizeCode: "160x60" }),
      variant({ id: "a1", stoneCode: "S1" }),
    ],
  });
  assert.deepEqual(model?.variants.map((item) => item.id), ["a2", "a1", "b1"]);
});

test("10 duplicate variant id keeps only the first occurrence", () => {
  const model = build({
    variants: [variant({ id: "dup", stoneCode: "S1" }), variant({ id: "dup", stoneCode: "S2" })],
  });
  assert.equal(model?.variants.length, 1);
  assert.equal(model?.variants[0]?.stoneCode, "S1");
});

test("11 unavailable options are dropped", () => {
  const model = build({
    variants: [
      variant({ options: [option({ id: "o1" }), option({ id: "o2", isAvailable: false })] }),
    ],
  });
  assert.deepEqual(model?.variants[0]?.options.map((item) => item.id), ["o1"]);
});

test("12 options incompatible with the variant size are dropped", () => {
  const model = build({
    variants: [
      variant({
        options: [option({ id: "o1" }), option({ id: "o2", compatibleSizeCodes: ["180x60"] })],
      }),
    ],
  });
  assert.deepEqual(model?.variants[0]?.options.map((item) => item.id), ["o1"]);
});

test("13 duplicate option id keeps only the first occurrence", () => {
  const model = build({
    variants: [
      variant({ options: [option({ id: "dup", title: "اول" }), option({ id: "dup", title: "دوم" })] }),
    ],
  });
  assert.equal(model?.variants[0]?.options.length, 1);
  assert.equal(model?.variants[0]?.options[0]?.title, "اول");
});

test("14 media that is not privacy cleared is dropped", () => {
  const model = build({
    media: [
      { mediaKey: "k1", alt: "الف", caption: null, privacyCleared: false, consentReference: null },
      { mediaKey: "k2", alt: "ب", caption: null, privacyCleared: true, consentReference: null },
    ],
  });
  assert.deepEqual(model?.media.map((item) => item.alt), ["ب"]);
});

test("15 media with a blank alt is dropped", () => {
  const model = build({
    media: [
      { mediaKey: "k1", alt: "   ", caption: null, privacyCleared: true, consentReference: null },
    ],
  });
  assert.deepEqual(model?.media, []);
});

test("16 mediaKey never enters the display view-model", () => {
  const model = build({
    media: [
      { mediaKey: "secret-key", alt: "الف", caption: "ب", privacyCleared: true, consentReference: null },
    ],
  });
  assert.deepEqual(Object.keys(model!.media[0]!).sort(), ["alt", "caption"]);
  assert.equal(JSON.stringify(model).includes("secret-key"), false);
});

test("17 blank summary and description become null", () => {
  const model = build({ summary: "   ", description: "" });
  assert.equal(model?.summary, null);
  assert.equal(model?.description, null);
});

test("18 the adapter input is never mutated", () => {
  const input = product({
    variants: [variant({ options: [option({ isAvailable: false })] })],
    media: [
      { mediaKey: "k", alt: " ", caption: null, privacyCleared: true, consentReference: null },
    ],
  });
  const before = JSON.stringify(input);
  buildProductDetailModel(input, "sang-1");
  assert.equal(JSON.stringify(input), before);
});

const detailVariant = (over: Partial<Product> = {}, slug = "sang-1") =>
  buildProductDetailModel(product(over), slug)!.variants[0]!;

test("19 all-fixed selection sums into a fixed amount", () => {
  const v = detailVariant({ variants: [variant({ options: [option({ id: "o1" })] })] });
  const price = resolveSelectionPrice(v, v.options);
  assert.deepEqual(price, { priceType: "fixed", amountToman: 1_100_000 });
});

test("20 any estimate component makes the sum an estimate", () => {
  const v = detailVariant({
    variants: [variant({ options: [option({ id: "o1", priceType: "estimate" })] })],
  });
  const price = resolveSelectionPrice(v, v.options);
  assert.deepEqual(price, { priceType: "estimate", amountToman: 1_100_000 });
});

test("21 any review component forces review with a null amount", () => {
  const v = detailVariant({
    variants: [variant({ options: [option({ id: "o1", priceType: "review", amountToman: null })] })],
  });
  assert.deepEqual(resolveSelectionPrice(v, v.options), {
    priceType: "review",
    amountToman: null,
  });
});

test("22 custom size is always review", () => {
  const v = detailVariant({ variants: [variant({ sizeCode: "custom" })] });
  assert.deepEqual(resolveSelectionPrice(v, []), { priceType: "review", amountToman: null });
});

test("23 an invalid variant amount forces review", () => {
  for (const amount of [0, -1, 1.5, null]) {
    const v = detailVariant({ variants: [variant({ amountToman: amount as number | null })] });
    assert.deepEqual(resolveSelectionPrice(v, []), { priceType: "review", amountToman: null });
  }
});

test("24 a fixed option without a valid amount forces review", () => {
  const v = detailVariant({
    variants: [variant({ options: [option({ id: "o1", amountToman: null })] })],
  });
  assert.deepEqual(resolveSelectionPrice(v, v.options), {
    priceType: "review",
    amountToman: null,
  });
});

test("25 only an exact YYYY-MM-DD price date is accepted", () => {
  assert.equal(normalizePriceDate("2026-01-01"), "2026-01-01");
  for (const bad of ["2026-1-1", "01-01-2026", "2026-13-01", "2026-01-01T00:00:00Z", "", null]) {
    assert.equal(normalizePriceDate(bad), null, `must reject ${String(bad)}`);
  }
  const v = detailVariant({ variants: [variant({ priceUpdatedAt: "2026/01/01" })] });
  assert.equal(v.priceUpdatedAt, null);
});

test("26 product.updatedAt never substitutes for the price date", () => {
  const v = detailVariant({ variants: [variant({ priceUpdatedAt: null })] });
  assert.equal(v.priceUpdatedAt, null);
  const model = build({ variants: [variant({ priceUpdatedAt: null })] });
  assert.equal(JSON.stringify(model).includes("2026-07-07"), false);
});

test("resolveSelectionPrice does not mutate its inputs", () => {
  const v = detailVariant({ variants: [variant({ options: [option({ id: "o1" })] })] });
  const before = JSON.stringify(v);
  resolveSelectionPrice(v, v.options);
  assert.equal(JSON.stringify(v), before);
});
