import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { validateLocaleQuery } from "./locale-query";

test("site locale queries are explicit, allowlisted and backwards compatible with Persian", () => {
  assert.deepEqual(validateLocaleQuery(undefined), { locale: "fa" });
  assert.deepEqual(validateLocaleQuery({}), { locale: "fa" });
  assert.deepEqual(validateLocaleQuery({ locale: "en" }), { locale: "en" });
  for (const input of [
    null,
    [],
    { locale: null },
    { locale: "ar" },
    { locale: ["en"] },
    { locale: "en", secret: "synthetic-private-value" },
  ])
    assert.throws(() => validateLocaleQuery(input), /Invalid locale query/);
});
test("actual repository, adapters and service loaders select reviewed Site prose in the active language", async () => {
  const root = await mkdtemp(join(tmpdir(), "genesis-site-locale-"));
  const repo = fileURLToPath(new URL("../../../", import.meta.url));
  try {
    const script = `
import assert from "node:assert/strict";
import { mock } from "bun:test";
import { validateLocaleQuery } from ${JSON.stringify(join(repo, "src/lib/content/locale-query.ts"))};
const common = { latinName: "Test brand", phone: "+989120000000", whatsappUrl: null, telegram: null,
  links: { instagram: null, website: null, map: null } };
const sites = { fa: { ...common, locale: "fa", displayName: "نام آزمون", address: "نشانی آزمون", workingHours: "ساعت آزمون" },
  en: { ...common, locale: "en", displayName: "Test name", address: "Test address", workingHours: "Test hours" } };
const product = { id: "p-1", code: "TEST-1", slug: "test-stone", type: "simple", title: "Test stone", summary: null,
  description: null, isActive: true, isFeatured: false, updatedAt: "2026-10-13", seo: null, media: [],
  variants: [{ id: "v-1", stoneCode: "granite", sizeCode: "120x60", priceType: "review", amountToman: null,
    priceUpdatedAt: null, isAvailable: true, includes: [], excludes: [], options: [] }] };
mock.module(${JSON.stringify(join(repo, "src/lib/content/generated-structured-content.ts"))}, () => ({
  GENERATED_SITES: sites, GENERATED_SITE: sites.fa, GENERATED_PRODUCTS: ["fa", "en"].map((locale) => ({ ...product, locale })),
  GENERATED_PORTFOLIO_ITEMS: [], GENERATED_CATALOG_VERSION: null,
}));
const repository = await import(${JSON.stringify(join(repo, "src/lib/content/supabase.server.ts"))});
const calls = [];
mock.module(${JSON.stringify(join(repo, "src/lib/content/supabase.functions.ts"))}, () => ({
  getSiteFromServer: async (input) => { const query = validateLocaleQuery(input.data); calls.push(query.locale); return repository.loadSite(query.locale); },
  getProductFromServer: async ({ data }) => repository.loadProduct(data.slug, data.locale),
  getProductsFromServer: async ({ data }) => repository.loadProducts(data),
  getPortfolioItemsFromServer: async () => [], getCatalogVersionFromServer: async () => null,
}));
mock.module(${JSON.stringify(join(repo, "src/lib/content/git.functions.ts"))}, () => ({ getPageFromGitServer: async () => null,
  getGuideFromGitServer: async () => null, getGuidesFromGitServer: async () => [] }));
globalThis.fetch = async () => { throw new Error("No network in site fixture"); };
const adapters = await import(${JSON.stringify(join(repo, "src/lib/content/adapters.ts"))});
const routes = await import(${JSON.stringify(join(repo, "src/lib/route-defs/pages.tsx"))});
for (const locale of ["fa", "en"]) {
  assert.equal((await adapters.getSite(locale)).locale, locale);
  for (const data of [await routes.customFunnelRouteOptions(locale).loader(),
    await routes.productDetailRouteOptions(locale).loader({ params: { slug: "test-stone" } }),
    await routes.buildingStoneRouteOptions(locale).loader(),
    await routes.quoteRouteOptions(locale).loader({ deps: { reference: null, category: null } })]) {
    assert.equal(data.site.locale, locale);
    assert.equal(data.site.address, sites[locale].address);
  }
  const contact = await routes.contactRouteOptions(locale).loader();
  assert.equal(contact.details.find((item) => item.key === "address").value, sites[locale].address);
}
assert.equal((await adapters.getSite()).locale, "fa");
const copy = await repository.loadSite("en");
copy.links.website = "https://fixtures.invalid";
assert.equal(sites.en.links.website, null);
sites.en = null;
const neutral = await adapters.getSite("en");
assert.equal(neutral.displayName, "Test brand");
assert.equal(neutral.phone, common.phone);
assert.equal(neutral.address, null);
assert.equal(neutral.workingHours, null);
assert.equal(/[\\u0600-\\u06ff]/.test(JSON.stringify(neutral)), false);
assert.equal(await repository.loadSite("ar"), null);
assert.deepEqual(calls.slice(0, 14), ["fa", "fa", "fa", "fa", "fa", "fa", "en", "en", "en", "en", "en", "en", "fa", "en"]);
console.log("site-locale-fixture-passed");
`;
    const file = join(root, "site-fixture.ts");
    await writeFile(file, script);
    const result = spawnSync(process.execPath, [file], {
      cwd: repo,
      encoding: "utf8",
      timeout: 15_000,
      env: { PATH: process.env["PATH"] ?? "" },
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "site-locale-fixture-passed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
