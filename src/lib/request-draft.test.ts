import { test } from "node:test";
import assert from "node:assert/strict";

import type { Product, ProductOption, ProductVariant } from "../lib/content/types";
import { buildProductDetailModel, resolveSelectionPrice } from "../lib/product-detail";
import { DRAFT_KEYS, buildGraveStoneRequestDraft } from "../lib/request-draft";

const VALID_CATALOG_VERSION = "a".repeat(64);

const option = (over: Partial<ProductOption> = {}): ProductOption => ({
  id: "opt-1",
  title: "گزینه یک",
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
  options: [option({ id: "o1", title: "اول" }), option({ id: "o2", title: "دوم" })],
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

const model = (over: Partial<Product> = {}) => buildProductDetailModel(product(over), "sang-1")!;

test("1 an invalid catalog version yields a null draft", () => {
  for (const version of [null, undefined, "", "not-a-hash", "A".repeat(64)]) {
    assert.equal(
      buildGraveStoneRequestDraft({
        model: model(),
        catalogVersion: version,
        variantId: "v-1",
        optionIds: [],
      }),
      null,
    );
  }
});

test("2 an unknown variant yields a null draft", () => {
  assert.equal(
    buildGraveStoneRequestDraft({
      model: model(),
      catalogVersion: VALID_CATALOG_VERSION,
      variantId: "nope",
      optionIds: [],
    }),
    null,
  );
});

test("3 an unknown option id yields a null draft", () => {
  assert.equal(
    buildGraveStoneRequestDraft({
      model: model(),
      catalogVersion: VALID_CATALOG_VERSION,
      variantId: "v-1",
      optionIds: ["ghost"],
    }),
    null,
  );
});

test("4 an incompatible option id yields a null draft", () => {
  const withIncompatible = model({
    variants: [variant({ options: [option({ id: "o9", compatibleSizeCodes: ["180x60"] })] })],
  });
  assert.equal(
    buildGraveStoneRequestDraft({
      model: withIncompatible,
      catalogVersion: VALID_CATALOG_VERSION,
      variantId: "v-1",
      optionIds: ["o9"],
    }),
    null,
  );
});

test("5 a duplicate option id yields a null draft", () => {
  assert.equal(
    buildGraveStoneRequestDraft({
      model: model(),
      catalogVersion: VALID_CATALOG_VERSION,
      variantId: "v-1",
      optionIds: ["o1", "o1"],
    }),
    null,
  );
});

const draft = () =>
  buildGraveStoneRequestDraft({
    model: model(),
    catalogVersion: VALID_CATALOG_VERSION,
    variantId: "v-1",
    optionIds: ["o2", "o1"],
  })!;

test("6 the draft exposes only the allowed keys", () => {
  assert.deepEqual(Object.keys(draft()).sort(), [...DRAFT_KEYS].sort());
});

test("7 requestType is grave_stone", () => {
  assert.equal(draft().requestType, "grave_stone");
});

test("8 product and variant identifiers are carried through", () => {
  const value = draft();
  assert.equal(value.productId, "p-1");
  assert.equal(value.productCode, "C-1");
  assert.equal(value.variantId, "v-1");
  assert.equal(value.stoneCode, "MA-1001");
  assert.equal(value.sizeCode, "120x60");
});

test("9 option ids follow adapter order, not selection order", () => {
  assert.deepEqual([...draft().optionIds], ["o1", "o2"]);
  assert.deepEqual([...draft().displaySnapshot.optionTitles], ["اول", "دوم"]);
});

test("10 the snapshot exposes only derived display data", () => {
  assert.deepEqual(Object.keys(draft().displaySnapshot).sort(), [
    "amountToman",
    "excludes",
    "includes",
    "optionTitles",
    "priceLabel",
    "priceType",
    "priceUpdatedAt",
    "productTitle",
    "productTypeLabel",
    "sizeLabel",
    "stoneCode",
  ]);
});

test("11 the draft contains no PII field", () => {
  const serialized = JSON.stringify(draft()).toLowerCase();
  for (const banned of [
    "name",
    "phone",
    "mobile",
    "email",
    "city",
    "address",
    "location",
    "note",
    "contact",
    "ip",
    "cookie",
    "useragent",
    "user_agent",
    "timestamp",
  ]) {
    assert.equal(serialized.includes(`"${banned}"`), false, `draft must not carry ${banned}`);
  }
});

test("12 the draft carries no slug, url, media key, terms or tracking code", () => {
  const serialized = JSON.stringify(draft());
  for (const banned of ["sang-1", "http", "mediaKey", "terms", "tracking", "trackingCode"]) {
    assert.equal(serialized.includes(banned), false, `draft must not carry ${banned}`);
  }
});

test("13 the price snapshot matches the official resolver", () => {
  const detail = model();
  const variantModel = detail.variants[0]!;
  const price = resolveSelectionPrice(variantModel, variantModel.options);
  const value = draft();
  assert.equal(value.displaySnapshot.priceType, price.priceType);
  assert.equal(value.displaySnapshot.amountToman, price.amountToman);
  assert.equal(value.displaySnapshot.amountToman, 1_200_000);
});

test("14 a review selection carries a null amount and no price date", () => {
  const reviewModel = model({
    variants: [variant({ sizeCode: "custom", options: [] })],
  });
  const value = buildGraveStoneRequestDraft({
    model: reviewModel,
    catalogVersion: VALID_CATALOG_VERSION,
    variantId: "v-1",
    optionIds: [],
  })!;
  assert.equal(value.displaySnapshot.priceType, "review");
  assert.equal(value.displaySnapshot.amountToman, null);
  assert.equal(value.displaySnapshot.priceUpdatedAt, null);
  assert.equal(value.displaySnapshot.priceLabel, "نیازمند بررسی");
});

test("15 building a draft mutates neither model nor inputs", () => {
  const detail = model();
  const before = JSON.stringify(detail);
  const optionIds = ["o1", "o2"];
  buildGraveStoneRequestDraft({
    model: detail,
    catalogVersion: VALID_CATALOG_VERSION,
    variantId: "v-1",
    optionIds,
  });
  assert.equal(JSON.stringify(detail), before);
  assert.deepEqual(optionIds, ["o1", "o2"]);
});
