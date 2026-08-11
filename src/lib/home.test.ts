import { test } from "node:test";
import assert from "node:assert/strict";

import { buildHomeViewModel } from "./home";
import type { Guide, Media, PortfolioItem, Product } from "./content/types";

function media(id = "a"): Media {
  return {
    src: `/media/aaaaaaaaaaaaaaaaaaaaaaaa/${id.padStart(16, "a")}-1280w.webp`,
    srcSet: `/media/aaaaaaaaaaaaaaaaaaaaaaaa/${id.padStart(16, "a")}-320w.webp 320w, /media/aaaaaaaaaaaaaaaaaaaaaaaa/${id.padStart(16, "a")}-640w.webp 640w, /media/aaaaaaaaaaaaaaaaaaaaaaaa/${id.padStart(16, "a")}-1280w.webp 1280w`,
    width: 1280,
    height: 1600,
    alt: "نمای سنگ",
  };
}

function product(slug: string, isActive = true, withMedia = false): Product {
  return {
    id: slug,
    code: slug.toUpperCase(),
    slug,
    type: "simple",
    title: `عنوان ${slug}`,
    summary: null,
    description: null,
    isActive,
    isFeatured: true,
    media: withMedia ? [media()] : [],
    variants: [],
    seo: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function portfolioItem(id: string): PortfolioItem {
  return { publicReferenceId: id, media: [media()] };
}

function guide(slug: string, summary: string | null = null): Guide {
  return {
    slug,
    title: `راهنما ${slug}`,
    summary,
    body: "",
    seo: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

const EMPTY = { products: [], portfolioItems: [], guides: [] };

test("empty adapter results hide every optional section", () => {
  const model = buildHomeViewModel(EMPTY);
  assert.equal(model.showProducts, false);
  assert.equal(model.showPortfolio, false);
  assert.equal(model.showGuide, false);
  assert.equal(model.guide, null);
  assert.equal(model.heroMedia, null);
  assert.deepEqual([...model.products], []);
});

test("one or two products keep the product section hidden", () => {
  for (const count of [1, 2]) {
    const products = Array.from({ length: count }, (_, i) => product(`p${i}`));
    const model = buildHomeViewModel({ ...EMPTY, products });
    assert.equal(model.showProducts, false, `count ${count} must stay hidden`);
    assert.equal(model.products.length, 0);
  }
});

test("three active products reveal the product section", () => {
  const model = buildHomeViewModel({
    ...EMPTY,
    products: [product("a"), product("b"), product("c")],
  });
  assert.equal(model.showProducts, true);
  assert.equal(model.products.length, 3);
});

test("the first real featured media becomes the hero media", () => {
  const model = buildHomeViewModel({
    ...EMPTY,
    products: [product("a"), product("b", true, true), product("c")],
  });
  assert.equal(model.heroMedia?.src.endsWith("-1280w.webp"), true);
});

test("inactive products are not counted", () => {
  const model = buildHomeViewModel({
    ...EMPTY,
    products: [product("a"), product("b"), product("c", false)],
  });
  assert.equal(model.showProducts, false);
});

test("at most six products are kept and adapter order is preserved", () => {
  const products = Array.from({ length: 9 }, (_, i) => product(`p${i}`));
  const model = buildHomeViewModel({ ...EMPTY, products });
  assert.equal(model.products.length, 6);
  assert.deepEqual(
    model.products.map((item) => item.slug),
    ["p0", "p1", "p2", "p3", "p4", "p5"],
  );
});

test("empty summaries are normalised to null", () => {
  const withBlank = { ...product("a"), summary: "   " };
  const model = buildHomeViewModel({
    ...EMPTY,
    products: [withBlank, product("b"), product("c")],
  });
  assert.equal(model.products[0]?.summary, null);
});

test("portfolio section needs at least one valid item with public media", () => {
  assert.equal(buildHomeViewModel({ ...EMPTY, portfolioItems: [] }).showPortfolio, false);
  assert.equal(
    buildHomeViewModel({ ...EMPTY, portfolioItems: [{ publicReferenceId: "pf-1001", media: [] }] })
      .showPortfolio,
    false,
  );
  assert.equal(
    buildHomeViewModel({ ...EMPTY, portfolioItems: [portfolioItem("pf-1001")] }).showPortfolio,
    true,
  );
});

test("guide section needs at least one valid guide and keeps only the first", () => {
  assert.equal(buildHomeViewModel({ ...EMPTY, guides: [] }).showGuide, false);
  const model = buildHomeViewModel({ ...EMPTY, guides: [guide("one", " خلاصه "), guide("two")] });
  assert.equal(model.showGuide, true);
  assert.equal(model.guide?.slug, "one");
  assert.equal(model.guide?.summary, "خلاصه");
});

test("blank guide summary is omitted", () => {
  const model = buildHomeViewModel({ ...EMPTY, guides: [guide("one", "  ")] });
  assert.equal(model.guide?.summary, null);
});

test("inputs are never mutated", () => {
  const products = [product("a"), product("b"), product("c")];
  const snapshot = JSON.stringify(products);
  buildHomeViewModel({ ...EMPTY, products });
  assert.equal(JSON.stringify(products), snapshot);
});
