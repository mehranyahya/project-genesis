import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

test("actual route loaders pass locale to catalog adapters before building their view models", async () => {
  const root = await mkdtemp(join(tmpdir(), "genesis-route-locale-"));
  const repository = fileURLToPath(new URL("../../../", import.meta.url));
  try {
    const source = `
import assert from "node:assert/strict";
import { mock } from "bun:test";
import { selectProduct, selectProducts, selectPortfolioItems } from ${JSON.stringify(join(repository, "src/lib/content/catalog-queries.ts"))};
const calls = [];
const operational = { id: "p-1", code: "TEST-1", slug: "shared-stone", type: "simple", isActive: true,
  isFeatured: false, summary: null, description: null, media: [], seo: null, updatedAt: "2026-10-11T00:00:00Z",
  variants: [{ id: "v-1", stoneCode: "granite", sizeCode: "120x60", priceType: "review", amountToman: null,
    priceUpdatedAt: null, includes: [], excludes: [], options: [], isAvailable: true }] };
let products = [{ ...operational, locale: "fa", title: "عنوان آزمون" }, { ...operational, locale: "en", title: "Test title" }];
const portfolio = ["fa", "en"].map((locale) => ({ locale, publicReferenceId: "pf-1001", summary: locale,
  media: [{ src: "/media/aaaaaaaaaaaaaaaaaaaaaaaa/aaaaaaaaaaaaaaaa-1280w.webp", srcSet: "", width: 1280, height: 1600, alt: locale }] }));
function record(name, locale) {
  assert.ok(locale === "fa" || locale === "en", "Route must pass an explicit locale");
  calls.push({ name, locale });
}
globalThis.fetch = async () => { throw new Error("No network in route fixture"); };
mock.module(${JSON.stringify(join(repository, "src/lib/content/adapters.ts"))}, () => ({
  getProducts: async (query) => { record("products", query?.locale); return selectProducts(products, query); },
  getProduct: async (slug, locale) => { record("product", locale); return selectProduct(products, slug, locale); },
  getPortfolioItems: async (query) => { record("portfolio", query?.locale); return selectPortfolioItems(portfolio, query); },
  getCatalogVersion: async () => "${"a".repeat(64)}", getSite: async () => null,
  getPage: async () => null, getGuide: async () => null, getGuides: async () => [],
}));
const routes = await import(${JSON.stringify(join(repository, "src/lib/route-defs/pages.tsx"))});
for (const locale of ["fa", "en"]) {
  const list = await routes.graveStoneListRouteOptions(locale).loader();
  assert.equal(list.items.length, 1);
  assert.equal(list.items[0].title, locale === "en" ? "Test title" : "عنوان آزمون");
  const custom = await routes.customFunnelRouteOptions(locale).loader();
  assert.equal(custom.products[0].locale, locale);
  const detail = await routes.productDetailRouteOptions(locale).loader({ params: { slug: "shared-stone" } });
  assert.equal(detail.model.title, locale === "en" ? "Test title" : "عنوان آزمون");
  assert.equal(detail.model.id, "p-1");
  const work = await routes.portfolioRouteOptions(locale).loader();
  assert.equal(work[0].media.alt, locale);
  const quote = await routes.quoteRouteOptions(locale).loader({ deps: { reference: "pf-1001", category: null } });
  assert.equal(quote.portfolioReferenceId, "pf-1001");
}
assert.deepEqual(calls, ["fa", "en"].flatMap((locale) => ["products", "products", "product", "portfolio", "portfolio"]
  .map((name) => ({ name, locale }))));
products = products.filter((product) => product.locale === "fa");
await assert.rejects(routes.productDetailRouteOptions("en").loader({ params: { slug: "shared-stone" } }));
console.log("catalog-route-fixture-passed");
`;
    const file = join(root, "route-fixture.ts");
    await writeFile(file, source);
    const result = spawnSync(process.execPath, [file], {
      cwd: repository,
      encoding: "utf8",
      timeout: 15_000,
      env: { PATH: process.env["PATH"] ?? "" },
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "catalog-route-fixture-passed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
