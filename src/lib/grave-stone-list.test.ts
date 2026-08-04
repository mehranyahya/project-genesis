import { test } from "node:test";
import assert from "node:assert/strict";

import type { Product, ProductVariant } from "@/lib/content/types";
import {
  GRAVE_STONE_SIZE_ORDER,
  NEUTRAL_GRAVE_STONE_FILTERS,
  buildGraveStoneListModel,
  filterGraveStoneItems,
  hasActiveGraveStoneFilters,
} from "@/lib/grave-stone-list";

/** Locally constructed inputs. Nothing is imported from runtime content files. */
function variant(overrides: Partial<ProductVariant>): ProductVariant {
  return {
    id: "v",
    stoneCode: "S1",
    sizeCode: "120x60",
    priceType: "review",
    amountToman: null,
    priceUpdatedAt: null,
    includes: [],
    excludes: [],
    options: [],
    isAvailable: true,
    ...overrides,
  };
}

function product(overrides: Partial<Product>): Product {
  return {
    id: "p",
    code: "C",
    slug: "s",
    type: "simple",
    title: "T",
    summary: null,
    description: null,
    isActive: true,
    isFeatured: false,
    media: [],
    variants: [variant({})],
    seo: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

test("empty adapter result yields an empty model", () => {
  assert.deepEqual(buildGraveStoneListModel([]), { items: [], stoneCodes: [] });
  assert.deepEqual(buildGraveStoneListModel(undefined).items, []);
});

test("inactive products are dropped", () => {
  assert.equal(buildGraveStoneListModel([product({ isActive: false })]).items.length, 0);
});

test("products with blank slug or title are dropped", () => {
  const model = buildGraveStoneListModel([
    product({ slug: "  " }),
    product({ slug: "a", title: "   " }),
  ]);
  assert.equal(model.items.length, 0);
});

test("products without an available variant are dropped", () => {
  const model = buildGraveStoneListModel([
    product({ variants: [variant({ isAvailable: false })] }),
    product({ slug: "b", variants: [] }),
  ]);
  assert.equal(model.items.length, 0);
});

test("unavailable variants do not contribute stone or size options", () => {
  const model = buildGraveStoneListModel([
    product({
      variants: [
        variant({ stoneCode: "A", sizeCode: "120x60", isAvailable: true }),
        variant({ stoneCode: "B", sizeCode: "180x60", isAvailable: false }),
      ],
    }),
  ]);
  assert.deepEqual(model.items[0].stoneCodes, ["A"]);
  assert.deepEqual(model.items[0].sizeCodes, ["120x60"]);
  assert.deepEqual(model.stoneCodes, ["A"]);
});

test("adapter order is preserved", () => {
  const model = buildGraveStoneListModel([
    product({ slug: "z" }),
    product({ slug: "a" }),
    product({ slug: "m" }),
  ]);
  assert.deepEqual(
    model.items.map((item) => item.slug),
    ["z", "a", "m"],
  );
});

test("blank summary becomes null and valid summary is trimmed", () => {
  const model = buildGraveStoneListModel([
    product({ slug: "a", summary: "   " }),
    product({ slug: "b", summary: "  متن  " }),
  ]);
  assert.equal(model.items[0].summary, null);
  assert.equal(model.items[1].summary, "متن");
});

test("duplicate stone codes collapse and first-seen order is kept", () => {
  const model = buildGraveStoneListModel([
    product({
      variants: [
        variant({ stoneCode: "B" }),
        variant({ stoneCode: " A " }),
        variant({ stoneCode: "B" }),
        variant({ stoneCode: "   " }),
      ],
    }),
  ]);
  assert.deepEqual(model.items[0].stoneCodes, ["B", "A"]);
});

test("sizes are emitted in the fixed contract order", () => {
  const model = buildGraveStoneListModel([
    product({
      variants: [
        variant({ sizeCode: "custom" }),
        variant({ sizeCode: "180x60" }),
        variant({ sizeCode: "120x60" }),
        variant({ sizeCode: "160x60" }),
      ],
    }),
  ]);
  assert.deepEqual(model.items[0].sizeCodes, [...GRAVE_STONE_SIZE_ORDER]);
});

const catalog = buildGraveStoneListModel([
  product({
    slug: "simple-one",
    type: "simple",
    variants: [
      variant({ stoneCode: "A", sizeCode: "120x60" }),
      variant({ stoneCode: "B", sizeCode: "180x60" }),
    ],
  }),
  product({
    slug: "cnc-one",
    type: "cnc_box",
    variants: [variant({ stoneCode: "C", sizeCode: "160x60" })],
  }),
]);

test("type filter selects only matching products", () => {
  const result = filterGraveStoneItems(catalog.items, {
    ...NEUTRAL_GRAVE_STONE_FILTERS,
    type: "cnc_box",
  });
  assert.deepEqual(
    result.map((item) => item.slug),
    ["cnc-one"],
  );
});

test("stone filter selects only matching products", () => {
  const result = filterGraveStoneItems(catalog.items, {
    ...NEUTRAL_GRAVE_STONE_FILTERS,
    stoneCode: "C",
  });
  assert.deepEqual(
    result.map((item) => item.slug),
    ["cnc-one"],
  );
});

test("size filter selects only matching products", () => {
  const result = filterGraveStoneItems(catalog.items, {
    ...NEUTRAL_GRAVE_STONE_FILTERS,
    sizeCode: "180x60",
  });
  assert.deepEqual(
    result.map((item) => item.slug),
    ["simple-one"],
  );
});

test("stone and size must match within one single available variant", () => {
  const both = filterGraveStoneItems(catalog.items, {
    ...NEUTRAL_GRAVE_STONE_FILTERS,
    stoneCode: "A",
    sizeCode: "180x60",
  });
  assert.deepEqual(both, []);
  const same = filterGraveStoneItems(catalog.items, {
    ...NEUTRAL_GRAVE_STONE_FILTERS,
    stoneCode: "A",
    sizeCode: "120x60",
  });
  assert.deepEqual(
    same.map((item) => item.slug),
    ["simple-one"],
  );
});

test("an impossible combination returns an empty array", () => {
  assert.deepEqual(
    filterGraveStoneItems(catalog.items, {
      type: "cnc_box",
      stoneCode: "A",
      sizeCode: "120x60",
    }),
    [],
  );
});

test("neutral state is all and matches the active-filter predicate", () => {
  assert.deepEqual(NEUTRAL_GRAVE_STONE_FILTERS, {
    type: "all",
    stoneCode: "all",
    sizeCode: "all",
  });
  assert.equal(hasActiveGraveStoneFilters(NEUTRAL_GRAVE_STONE_FILTERS), false);
  assert.equal(
    hasActiveGraveStoneFilters({ ...NEUTRAL_GRAVE_STONE_FILTERS, sizeCode: "custom" }),
    true,
  );
  assert.deepEqual(filterGraveStoneItems(catalog.items, NEUTRAL_GRAVE_STONE_FILTERS).length, 2);
});

test("adapter input is never mutated", () => {
  const input = [product({ slug: "a", summary: "  x  " })];
  const snapshot = JSON.parse(JSON.stringify(input));
  buildGraveStoneListModel(input);
  filterGraveStoneItems(buildGraveStoneListModel(input).items, NEUTRAL_GRAVE_STONE_FILTERS);
  assert.deepEqual(JSON.parse(JSON.stringify(input)), snapshot);
});
