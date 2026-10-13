import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

test("real adapters and page/form route loaders read the requested compiled translation without fallback", async () => {
  const repository = fileURLToPath(new URL("../../../", import.meta.url));
  const root = await mkdtemp(join(repository, ".git-pages-runtime-"));
  try {
    const source = `
import assert from "node:assert/strict";
import { mock } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { createRootRoute, createRoute, createRouter, createMemoryHistory, Outlet, RouterProvider } from "@tanstack/react-router";
import { LocaleProvider } from ${JSON.stringify(join(repository, "src/lib/i18n/react.tsx"))};
import { parseGitPage } from ${JSON.stringify(join(repository, "scripts/git-pages.mjs"))};
import { validatePageLookup } from ${JSON.stringify(join(repository, "src/lib/content/page-lookup.ts"))};
const pages = { fa: {}, en: {} }, calls = [];
const asset = "a".repeat(24), hash = "b".repeat(16);
const image = { src: "/media/" + asset + "/" + hash + "-1280w.webp",
  srcSet: [320, 640, 1280].map((w) => "/media/" + asset + "/" + hash + "-" + w + "w.webp " + w + "w").join(", "),
  width: 1280, height: 853, alt: "Synthetic reviewed image" };
const building = { fa: [image], en: [image] }, portfolio = ["fa", "en"].map((locale) => ({ locale, publicReferenceId: "pf-1001", media: [image] }));
mock.module(${JSON.stringify(join(repository, "src/lib/content/generated-structured-content.ts"))}, () => ({
  GENERATED_BUILDING_MEDIA: building, GENERATED_PORTFOLIO_ITEMS: portfolio,
  GENERATED_PRODUCTS: [], GENERATED_SITE: null, GENERATED_SITES: { fa: null, en: null }, GENERATED_CATALOG_VERSION: null,
}));
for (const locale of ["fa", "en"]) for (const slug of ["about", "privacy", "terms", "contact", "not-found", "building-stone", "stoneworks"]) {
  const raw = ["---", 'slug: "' + slug + '"', 'locale: "' + locale + '"', 'status: "published"', "reviewed: true",
    'title: "' + locale + ' test title"', 'version: "test-v1"', 'seoTitle: "Test title"',
    'canonicalPath: "' + (locale === "en" ? "/en" : "") + "/" + slug + '"',
    ...(slug === "stoneworks" ? ['stoneworkCategories: ["water_landscape", "sculpture_art"]'] : []),
    ...(slug === "building-stone" ? ['mediaReferences: [{"source":"building","assetId":"' + asset + '"}]'] : []),
    ...(slug === "stoneworks" ? ['mediaReferences: [{"source":"portfolio","publicReferenceId":"pf-1001","assetId":"' + asset + '"}]'] : []),
    "---", locale + " synthetic test body"].join("\\n");
  pages[locale][slug] = parseGitPage(raw, slug, locale);
}
mock.module(${JSON.stringify(join(repository, "src/lib/content/generated-pages.ts"))}, () => ({ GIT_PAGES: pages }));
const { loadGitPage } = await import(${JSON.stringify(join(repository, "src/lib/content/git.server.ts"))});
const { loadPortfolioItems } = await import(${JSON.stringify(join(repository, "src/lib/content/supabase.server.ts"))});
mock.module(${JSON.stringify(join(repository, "src/lib/content/git.functions.ts"))}, () => ({
  getGuideFromGitServer: async () => null, getGuidesFromGitServer: async () => [], getPageFromGitServer: async (input) => {
  const lookup = validatePageLookup(input.data);
  assert.ok(input.data.locale === "fa" || input.data.locale === "en");
  calls.push(lookup);
  return loadGitPage(lookup.slug, lookup.locale);
} }));
const product = { id: "p-1", code: "TEST-1", slug: "test-product", title: "Test product", type: "simple", isActive: true,
  isFeatured: false, summary: null, description: null, media: [],
  variants: [{ id: "v-1", stoneCode: "test-stone", sizeCode: "120x60", priceType: "review", amountToman: null,
    priceUpdatedAt: null, includes: [], excludes: [], options: [], isAvailable: true }], seo: null, updatedAt: "2026-10-12" };
mock.module(${JSON.stringify(join(repository, "src/lib/content/supabase.functions.ts"))}, () => ({
  getSiteFromServer: async () => null, getCatalogVersionFromServer: async () => null,
  getProductsFromServer: async () => [], getPortfolioItemsFromServer: async ({ data }) => loadPortfolioItems(data),
  getProductFromServer: async ({ data }) => ({ ...product, locale: data.locale }),
}));
globalThis.fetch = async () => { throw new Error("No network in page fixture"); };
const adapters = await import(${JSON.stringify(join(repository, "src/lib/content/adapters.ts"))});
const routes = await import(${JSON.stringify(join(repository, "src/lib/route-defs/pages.tsx"))});
const { getRequestTermsDocument } = await import(${JSON.stringify(join(repository, "src/lib/request-terms.ts"))});
for (const locale of ["fa", "en"]) {
  for (const slug of ["about", "privacy", "terms"]) {
    const options = routes[slug + "RouteOptions"](locale), page = await options.loader();
    assert.equal(page.title, locale + " test title");
    assert.equal(page.canonicalPath, (locale === "en" ? "/en" : "") + "/" + slug);
  }
  assert.equal((await routes.contactRouteOptions(locale).loader()).page.title, locale + " test title");
  const doc = await getRequestTermsDocument(locale);
  assert.equal(doc.locale, locale);
  assert.equal(doc.contentHash, pages[locale].terms.contentHash);
  for (const data of [await routes.customFunnelRouteOptions(locale).loader(),
    await routes.productDetailRouteOptions(locale).loader({ params: { slug: "test-product" } }),
    await routes.buildingStoneRouteOptions(locale).loader(),
    await routes.quoteRouteOptions(locale).loader({ deps: { reference: null, category: null } })]) assert.deepEqual(data.termsDocument, doc);
  for (const [slug, factory] of [["building-stone", routes.buildingStoneRouteOptions], ["stoneworks", routes.stoneworksRouteOptions]]) {
    const options = factory(locale), loaded = await options.loader();
    const model = slug === "stoneworks" ? loaded : loaded.page;
    assert.equal(model.title, locale + " test title");
    assert.equal(model.serviceMedia.length, 1);
    assert.equal(Object.hasOwn(await adapters.getPage(slug, locale), "mediaReferences"), false);
    const meta = options.head({ loaderData: loaded }).meta;
    assert.ok(meta.some((item) => item.title === "Test title"));
    assert.equal(meta.some((item) => item.name === "robots" && item.content === "noindex"), false);
    await options.component.preload();
    const rootRoute = createRootRoute({ component: () => createElement(LocaleProvider, { locale }, createElement(Outlet)) });
    const path = (locale === "en" ? "/en" : "") + "/" + slug;
    const route = createRoute({ getParentRoute: () => rootRoute, path, ...options });
    const router = createRouter({ routeTree: rootRoute.addChildren([route]), history: createMemoryHistory({ initialEntries: [path] }), isServer: true });
    await router.load();
    assert.equal(router.state.matches.at(-1).status, "success");
    const html = renderToString(createElement(RouterProvider, { router }));
    assert.ok(html.includes(locale + " synthetic test body"));
    assert.equal((html.match(/<img\\b/g) ?? []).length, 1);
    assert.ok(html.includes('loading="lazy"'));
    assert.ok(html.includes('fetchPriority="auto"') || html.includes('fetchpriority="auto"'));
    assert.ok(html.includes('width="1280"') && html.includes('height="853"'));
    assert.ok(html.includes("object-contain"));
    if (slug === "stoneworks") {
      assert.ok(html.includes('href="' + (locale === "en" ? "/en" : "") + '/quote?source=portfolio&amp;reference=pf-1001"'));
      assert.equal((await routes.quoteRouteOptions(locale).loader({ deps: { reference: "pf-1001", category: null } })).portfolioReferenceId, "pf-1001");
    }
    assert.equal((html.match(/<h1\\b/g) ?? []).length, 1);
    if (slug === "stoneworks") assert.ok(html.includes("category=water_landscape"));
    if (locale === "en") assert.doesNotMatch(html, /[\\u0600-\\u06FF]/);
  }
}
const copy = await loadGitPage("terms", "en");
copy.seo.title = "Changed test title";
assert.equal((await loadGitPage("terms", "en")).seo.title, "Test title");
const categoryCopy = await loadGitPage("stoneworks", "en");
categoryCopy.stoneworkCategories.reverse();
assert.deepEqual((await loadGitPage("stoneworks", "en")).stoneworkCategories, ["water_landscape", "sculpture_art"]);
const mediaCopy = await loadGitPage("building-stone", "en"); mediaCopy.serviceMedia[0].media.alt = "Changed output";
assert.equal((await loadGitPage("building-stone", "en")).serviceMedia[0].media.alt, image.alt);
building.en = [];
assert.deepEqual((await loadGitPage("building-stone", "en")).serviceMedia, []);
assert.equal((await loadGitPage("building-stone", "fa")).serviceMedia.length, 1);
portfolio.splice(1, 1);
assert.deepEqual((await loadGitPage("stoneworks", "en")).serviceMedia, []);
assert.equal((await routes.quoteRouteOptions("en").loader({ deps: { reference: "pf-1001", category: null } })).portfolioReferenceId, null);
assert.equal((await adapters.getPage("terms")).locale, "fa");
assert.notEqual(pages.fa.terms.contentHash, pages.en.terms.contentHash);
delete pages.en.terms;
assert.equal(await getRequestTermsDocument("en"), null);
assert.equal(await routes.termsRouteOptions("en").loader(), null);
assert.ok(await getRequestTermsDocument("fa"));
assert.equal(await loadGitPage("terms", "ar"), null);
assert.equal(await loadGitPage("unknown", "fa"), null);
for (const [slug, factory] of [["building-stone", routes.buildingStoneRouteOptions], ["stoneworks", routes.stoneworksRouteOptions]]) {
  delete pages.en[slug];
  const options = factory("en"), data = await options.loader();
  assert.equal(slug === "stoneworks" ? data : data.page, null);
  assert.ok(options.head({ loaderData: data }).meta.some((item) => item.name === "robots" && item.content === "noindex"));
  assert.ok(await factory("fa").loader());
}
const portfolioMeta = routes.portfolioRouteOptions("en").head().meta;
assert.ok(portfolioMeta.some((item) => item.name === "description" && item.content.includes("architectural") && item.content.includes("bespoke")));
assert.ok(calls.some((call) => call.slug === "terms" && call.locale === "en"));
console.log("git-page-runtime-fixture-passed");
`;
    const file = join(root, "runtime-fixture.ts");
    await writeFile(file, source);
    const result = spawnSync(process.execPath, [file], {
      cwd: repository,
      encoding: "utf8",
      timeout: 15_000,
      env: { PATH: process.env["PATH"] ?? "" },
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "git-page-runtime-fixture-passed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the active Edge business path stores the accepted translation hash with the existing RPC contract", async () => {
  const root = await mkdtemp(join(tmpdir(), "genesis-terms-business-"));
  const repository = fileURLToPath(new URL("../../../", import.meta.url));
  try {
    const source = `
import assert from "node:assert/strict";
import { mock } from "bun:test";
const fa = "${"a".repeat(64)}", en = "${"b".repeat(64)}";
mock.module(${JSON.stringify(join(repository, "supabase/functions/_shared/terms-registry.generated.ts"))}, () => ({
  CURRENT_TERMS_RELEASES: { fa: { version: "test-v1", currentContentHash: fa, allowedContentHashes: [fa] },
    en: { version: "test-v1", currentContentHash: en, allowedContentHashes: [en] } },
}));
globalThis.fetch = async () => { throw new Error("No network in business fixture"); };
const { prepareBusinessRequest } = await import(${JSON.stringify(join(repository, "supabase/functions/_shared/request-business.ts"))});
const base = { submission_id: "11111111-1111-4111-8111-111111111111", request_type: "contact", customer_name: "Synthetic test customer",
  phone: "+989120000000", city: null, location_text: null, preferred_contact: "phone", preferred_contact_time: null,
  customer_note: null, terms_accepted: true, terms_version: "test-v1" };
const options = { config: {}, fingerprint: "${"c".repeat(64)}", fingerprintKeyId: "test-v1", botVerification: "unverified_no_token",
  riskFlags: [], ipHash: null, trackingCodePrefix: "REQ", nowIso: "2026-10-12T00:00:00Z" };
for (const hash of [fa, en]) {
  const result = await prepareBusinessRequest({ ...options, request: { ...base, terms_content_hash: hash } });
  assert.equal(result.ok, true);
  assert.equal(result.storage.p_terms_content_hash, hash);
  assert.equal(result.storage.p_terms_version, "test-v1");
  assert.equal(result.storage.p_request_fingerprint, options.fingerprint);
  assert.equal(Object.hasOwn(result.storage, "p_locale"), false);
  assert.equal(Object.hasOwn(result.storage, "p_terms_locale"), false);
}
const result = await prepareBusinessRequest({ ...options, request: { ...base, terms_content_hash: "${"d".repeat(64)}" } });
assert.equal(result.ok, false);
assert.equal(result.status, 409);
assert.equal(result.body.terms_by_locale.en.content_hash, en);
console.log("terms-business-fixture-passed");
`;
    const file = join(root, "business-fixture.ts");
    await writeFile(file, source);
    const result = spawnSync(process.execPath, [file], {
      cwd: repository,
      encoding: "utf8",
      timeout: 15_000,
      env: { PATH: process.env["PATH"] ?? "" },
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "terms-business-fixture-passed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
