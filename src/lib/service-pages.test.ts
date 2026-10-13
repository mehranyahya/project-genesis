import assert from "node:assert/strict";
import { test } from "node:test";
import type { Page } from "./content/types";
import { buildStoneworksPageModel } from "./service-pages";
import { STONEWORK_CATEGORIES } from "./stoneworks";

const source: Page = {
  locale: "en",
  slug: "stoneworks",
  title: "Synthetic service title",
  body: "Synthetic service description.",
  seo: null,
  stoneworkCategories: ["water_landscape", "sculpture_art"],
};

test("missing, malformed or wrongly addressed service approval never offers default categories", () => {
  for (const page of [
    null,
    undefined,
    { ...source, slug: "about" },
    { ...source, body: "" },
    { ...source, stoneworkCategories: undefined },
    { ...source, stoneworkCategories: ["sculpture_art", "sculpture_art"] },
    { ...source, stoneworkCategories: ["not-a-category"] },
  ])
    assert.equal(buildStoneworksPageModel(page as Page | null), null);
});

test("selected service categories retain their operational IDs and owner-approved order without mutating source", () => {
  const before = JSON.stringify(source);
  const model = buildStoneworksPageModel(source)!;
  assert.deepEqual(
    model.categories.map((category) => category.id),
    ["water_landscape", "sculpture_art"],
  );
  assert.ok(
    model.categories.every(
      (category) => category.priceType === "review" && category.amountToman === null,
    ),
  );
  assert.equal(JSON.stringify(source), before);
  assert.notEqual(model.categories[0], STONEWORK_CATEGORIES[1]);
});

test("an explicit empty offering list renders approved service text without fabricating an offering", () => {
  const model = buildStoneworksPageModel({ ...source, stoneworkCategories: [] })!;
  assert.equal(model.title, source.title);
  assert.ok(model.blocks.length > 0);
  assert.deepEqual(model.categories, []);
});
