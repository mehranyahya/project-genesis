import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

test("real public artifacts, eight adapters, route metadata, bilingual SSR and default Worker sitemap agree on available translations", async () => {
  const repository = fileURLToPath(new URL("../../../", import.meta.url));
  const root = await mkdtemp(join(repository, ".seo-runtime-"));
  try {
    const source = `
import assert from "node:assert/strict";
import { mock } from "bun:test";
import { createElement, Fragment } from "react";
import { renderToString } from "react-dom/server";
import { createRootRoute, createRoute, createRouter, createMemoryHistory, HeadContent, Outlet, RouterProvider } from "@tanstack/react-router";
import { LocaleProvider } from "../src/lib/i18n/react.tsx";
import { validateProductQuery, validateProductLookup, validatePortfolioQuery } from "../src/lib/content/catalog-queries.ts";
import { validateGuideLookup, validateGuideQuery } from "../src/lib/content/guide-lookup.ts";
import { validatePageLookup } from "../src/lib/content/page-lookup.ts";
import { validateLocaleQuery } from "../src/lib/content/locale-query.ts";

function prefix(locale) { return locale === "en" ? "/en" : ""; }
function product(locale, slug) {
  return { locale, slug, id: "test-product", code: "TEST-1", type: "simple", title: locale + " Synthetic product",
    summary: locale + " Synthetic summary", description: null, isActive: true, isFeatured: false,
    media: [], updatedAt: "2026-10-13T01:02:03Z",
    seo: { title: locale + " Synthetic product SEO", description: locale + " Synthetic product description",
      robots: "index,follow", canonicalPath: prefix(locale) + "/grave-stones/" + slug },
    variants: [{ id: "test-variant", stoneCode: "granite", sizeCode: "120x60", priceType: "review",
      amountToman: null, priceUpdatedAt: null, includes: [], excludes: [], options: [], isAvailable: true }] };
}
function guide(locale, slug) {
  return { locale, slug, title: locale + " Synthetic guide", summary: locale + " Synthetic guide summary",
    body: "Synthetic complete guide body.", updatedAt: "2026-10-13",
    seo: { title: locale + " Synthetic guide SEO", description: locale + " Synthetic guide description",
      robots: "index,follow", canonicalPath: prefix(locale) + "/guides/" + slug } };
}
function page(locale, slug) {
  return { locale, slug, title: locale + " Synthetic service", body: "Synthetic complete service body.",
    ...(slug === "stoneworks" ? { stoneworkCategories: ["sculpture_art"] } : {}),
    seo: { title: locale + " Synthetic page SEO", description: null, robots: "index,follow",
      canonicalPath: prefix(locale) + "/" + slug } };
}
const products = [
  product("fa", "shared-stone"), product("en", "shared-stone"),
  product("fa", "fa-only"), product("en", "en-only"),
  product("fa", "hidden-translation"), product("en", "hidden-translation"),
  product("fa", "unavailable-translation"), { ...product("en", "unavailable-translation"), variants: [] },
  product("fa", "noncanonical"), { ...product("en", "inactive"), isActive: false },
];
products.find((item) => item.locale === "en" && item.slug === "hidden-translation").seo.robots = "noindex,follow";
products.find((item) => item.slug === "noncanonical").seo.canonicalPath = "/quote";
products.find((item) => item.slug === "fa-only").seo.title = "  ";
products.find((item) => item.slug === "fa-only").seo.description = "  ";
const guides = {
  fa: ["shared-care", "fa-only", "hidden-translation"].map((slug) => guide("fa", slug)),
  en: ["shared-care", "en-only", "hidden-translation"].map((slug) => guide("en", slug)),
};
guides.en.find((item) => item.slug === "hidden-translation").seo.robots = "noindex,follow";
const pages = { fa: { stoneworks: page("fa", "stoneworks"), "building-stone": page("fa", "building-stone"),
    about: page("fa", "about") }, en: { stoneworks: page("en", "stoneworks"), about: page("en", "about") } };
pages.en.about.seo.robots = "noindex,follow";
function site(locale) {
  return { locale, displayName: locale + " Synthetic brand", latinName: "Synthetic brand", phone: null,
    whatsappUrl: null, telegram: null, address: null, workingHours: null,
    links: { instagram: null, website: null, map: null } };
}
const sites = { fa: site("fa"), en: site("en") };
mock.module("../src/lib/content/generated-structured-content.ts", () => ({
  GENERATED_PRODUCTS: products, GENERATED_PORTFOLIO_ITEMS: [], GENERATED_BUILDING_MEDIA: { fa: [], en: [] },
  GENERATED_SITE: sites.fa, GENERATED_SITES: sites, GENERATED_CATALOG_VERSION: "a".repeat(64),
  STRUCTURED_CONTENT_GENERATED: true, STRUCTURED_TRANSLATIONS_SUPPORTED: true,
}));
mock.module("../src/lib/content/generated-guides.ts", () => ({ GIT_GUIDES: guides, GUIDE_SOURCES_SUPPORTED: true }));
mock.module("../src/lib/content/generated-pages.ts", () => ({ GIT_PAGES: pages }));
let networkCalls = 0;
globalThis.fetch = async () => { networkCalls++; throw new Error("Offline SEO fixture rejected network"); };
const structured = await import("../src/lib/content/supabase.server.ts");
const git = await import("../src/lib/content/git.server.ts");
const articles = await import("../src/lib/content/guides.server.ts");
// Isolate Start transport only; preserve actual artifacts, validators, repositories, adapters and route loaders.
mock.module("../src/lib/content/supabase.functions.ts", () => ({
  getProductsFromServer: async ({ data }) => structured.loadProducts(validateProductQuery(data)),
  getProductFromServer: async ({ data }) => { const q = validateProductLookup(data); return structured.loadProduct(q.slug, q.locale); },
  getPortfolioItemsFromServer: async ({ data }) => structured.loadPortfolioItems(validatePortfolioQuery(data)),
  getSiteFromServer: async ({ data }) => structured.loadSite(validateLocaleQuery(data).locale),
  getCatalogVersionFromServer: async () => structured.loadCatalogVersion(),
}));
mock.module("../src/lib/content/git.functions.ts", () => ({
  getPageFromGitServer: async ({ data }) => { const q = validatePageLookup(data); return git.loadGitPage(q.slug, q.locale); },
  getGuideFromGitServer: async ({ data }) => { const q = validateGuideLookup(data); return articles.loadGitGuide(q.slug, q.locale); },
  getGuidesFromGitServer: async ({ data }) => articles.loadGitGuides(validateGuideQuery(data)),
}));
const adapters = await import("../src/lib/content/adapters.ts");
const routes = await import("../src/lib/route-defs/pages.tsx");
const sitemap = await import("../src/lib/sitemap.server.ts");
assert.deepEqual(Object.keys(adapters).sort(), ["getCatalogVersion", "getGuide", "getGuides", "getPage", "getPortfolioItems", "getProduct", "getProducts", "getSite"]);
assert.deepEqual(Object.keys((await adapters.getGuides({ locale: "en" }))[0]).sort(), ["locale", "slug", "summary", "title", "updatedAt"]);
const original = JSON.stringify({ products, guides, pages });
function annotations(head) {
  return head.links.filter((link) => link.rel === "alternate").map((link) => link.hrefLang);
}
function canonical(head) {
  return head.links.find((link) => link.rel === "canonical").href;
}
async function render(locale, path, options, routePath = path) {
  if (options.component.preload) await options.component.preload();
  const root = createRootRoute({ component: () => createElement(Fragment, null,
    createElement(HeadContent), createElement(LocaleProvider, { locale }, createElement(Outlet))) });
  const route = createRoute({ getParentRoute: () => root, path: routePath, ...options });
  const router = createRouter({ routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: [path] }), isServer: true });
  await router.load();
  assert.equal(router.state.matches.at(-1).status, "success", String(router.state.matches.at(-1).error?.stack));
  const html = renderToString(createElement(RouterProvider, { router }));
  assert.equal((html.match(/rel="canonical"/g) ?? []).length, 1);
  return html;
}
for (const locale of ["fa", "en"]) {
  const p = await adapters.getProduct("shared-stone", locale);
  assert.deepEqual(p.translationLocales, ["fa", "en"]);
  const productOptions = routes.productDetailRouteOptions(locale);
  const productData = await productOptions.loader({ params: { slug: "shared-stone" } });
  const productHead = productOptions.head({ loaderData: productData });
  assert.deepEqual(annotations(productHead), ["fa", "en", "x-default"]);
  assert.equal(canonical(productHead), "https://example.com" + prefix(locale) + "/grave-stones/shared-stone");
  assert.ok(productHead.meta.some((item) => item.title === locale + " Synthetic product SEO"));
  assert.ok(productHead.meta.some((item) => item.name === "description" && item.content === locale + " Synthetic product description"));
  assert.ok(productHead.meta.some((item) => item.name === "robots" && item.content === "index,follow"));
  const html = await render(locale, prefix(locale) + "/grave-stones/shared-stone", productOptions, prefix(locale) + "/grave-stones/$slug");
  assert.ok(html.includes("<title>" + locale + " Synthetic product SEO</title>"));
  assert.ok(html.includes('href="https://example.com' + prefix(locale) + '/grave-stones/shared-stone"'));
  assert.equal((html.match(/rel="alternate"/g) ?? []).length, 3);
  const articleOptions = routes.guideDetailRouteOptions(locale);
  const article = await articleOptions.loader({ params: { slug: "shared-care" } });
  assert.deepEqual(annotations(articleOptions.head({ loaderData: article })), ["fa", "en", "x-default"]);
  const articleHtml = await render(locale, prefix(locale) + "/guides/shared-care", articleOptions, prefix(locale) + "/guides/$slug");
  assert.ok(articleHtml.includes("<title>" + locale + " Synthetic guide SEO</title>"));
  assert.ok(articleHtml.includes("Synthetic complete guide body."));
  assert.equal((articleHtml.match(/rel="alternate"/g) ?? []).length, 3);
  const serviceOptions = routes.stoneworksRouteOptions(locale);
  const service = await serviceOptions.loader();
  assert.deepEqual(annotations(serviceOptions.head({ loaderData: service })), ["fa", "en", "x-default"]);
  const serviceHtml = await render(locale, prefix(locale) + "/stoneworks", serviceOptions);
  assert.equal((serviceHtml.match(/rel="alternate"/g) ?? []).length, 3);
}
for (const family of ["product", "guide"]) {
  const factory = family === "product" ? routes.productDetailRouteOptions : routes.guideDetailRouteOptions;
  for (const locale of ["fa", "en"]) {
    const options = factory(locale), data = await options.loader({ params: { slug: locale + "-only" } });
    assert.deepEqual(annotations(options.head({ loaderData: data })), locale === "fa" ? ["fa", "x-default"] : ["en"]);
    const missing = factory(locale === "fa" ? "en" : "fa");
    await assert.rejects(missing.loader({ params: { slug: locale + "-only" } }));
  }
  const fa = factory("fa"), en = factory("en");
  const faData = await fa.loader({ params: { slug: "hidden-translation" } });
  const enData = await en.loader({ params: { slug: "hidden-translation" } });
  assert.deepEqual(annotations(fa.head({ loaderData: faData })), ["fa", "x-default"]);
  assert.deepEqual(annotations(en.head({ loaderData: enData })), []);
  assert.ok(en.head({ loaderData: enData }).meta.some((item) => item.name === "robots" && item.content === "noindex,follow"));
}
const canonicalOptions = routes.productDetailRouteOptions("fa");
const emptySeo = await canonicalOptions.loader({ params: { slug: "fa-only" } });
const emptySeoHead = canonicalOptions.head({ loaderData: emptySeo });
assert.ok(emptySeoHead.meta.some((item) => item.title === "fa Synthetic product"));
assert.ok(emptySeoHead.meta.some((item) => item.name === "description" && item.content === "fa Synthetic summary"));
const noncanonical = await canonicalOptions.loader({ params: { slug: "noncanonical" } });
assert.equal(canonical(canonicalOptions.head({ loaderData: noncanonical })), "https://example.com/grave-stones/noncanonical");
assert.deepEqual(annotations(canonicalOptions.head({ loaderData: noncanonical })), []);
assert.ok(canonicalOptions.head({ loaderData: noncanonical }).meta.some((item) => item.name === "robots" && item.content === "noindex,follow"));
const unavailable = await canonicalOptions.loader({ params: { slug: "unavailable-translation" } });
assert.deepEqual(annotations(canonicalOptions.head({ loaderData: unavailable })), ["fa", "x-default"]);
await assert.rejects(routes.productDetailRouteOptions("en").loader({ params: { slug: "unavailable-translation" } }));
await assert.rejects(routes.productDetailRouteOptions("en").loader({ params: { slug: "inactive" } }));
const buildingFa = routes.buildingStoneRouteOptions("fa"), buildingEn = routes.buildingStoneRouteOptions("en");
assert.deepEqual(annotations(buildingFa.head({ loaderData: await buildingFa.loader() })), ["fa", "x-default"]);
assert.deepEqual(annotations(buildingEn.head({ loaderData: await buildingEn.loader() })), []);
const aboutFa = routes.aboutRouteOptions("fa"), aboutEn = routes.aboutRouteOptions("en");
assert.deepEqual(annotations(aboutFa.head({ loaderData: await aboutFa.loader() })), ["fa", "x-default"]);
const aboutData = await aboutEn.loader();
assert.deepEqual(annotations(aboutEn.head({ loaderData: aboutData })), []);
const noindexHtml = await render("en", "/en/about", aboutEn);
assert.equal((noindexHtml.match(/rel="alternate"/g) ?? []).length, 0);
assert.ok(noindexHtml.includes('content="noindex,follow"'));
for (const locale of ["fa", "en"]) for (const factory of [routes.quoteRouteOptions, routes.customFunnelRouteOptions]) {
  const head = factory(locale).head();
  assert.ok(head.meta.some((item) => item.name === "robots" && item.content === "noindex,follow"));
  assert.deepEqual(annotations(head), []);
}
const clone = await adapters.getProduct("shared-stone", "en"); clone.seo.title = "Changed"; clone.translationLocales.pop();
assert.equal((await adapters.getProduct("shared-stone", "en")).seo.title, "en Synthetic product SEO");
assert.deepEqual((await adapters.getProduct("shared-stone", "en")).translationLocales, ["fa", "en"]);
const pageClone = await adapters.getPage("stoneworks", "en"); pageClone.translationLocales.pop();
assert.deepEqual((await adapters.getPage("stoneworks", "en")).translationLocales, ["fa", "en"]);
assert.equal(JSON.stringify({ products, guides, pages }), original);
const response = await sitemap.handleSitemapRequest(new Request("https://worker.example/sitemap.xml"),
  { PUBLIC_INDEXING: "true", SITE_URL: "https://example.com" });
assert.equal(response.status, 200);
const xml = await response.text();
for (const path of ["/", "/en", "/stoneworks", "/en/stoneworks", "/building-stone",
  "/grave-stones/shared-stone", "/en/grave-stones/shared-stone", "/guides/shared-care", "/en/guides/shared-care"])
  assert.ok(xml.includes("<loc>https://example.com" + path + "</loc>"), path);
for (const path of ["/en/building-stone", "/en/about", "/quote", "/en/quote", "/grave-stones/custom",
  "/grave-stones/noncanonical", "/en/grave-stones/inactive", "/en/grave-stones/unavailable-translation",
  "/en/grave-stones/hidden-translation", "/en/guides/hidden-translation"])
  assert.equal(xml.includes("<loc>https://example.com" + path + "</loc>"), false, path);
const enGuide = guides.en.findIndex((item) => item.slug === "shared-care"); guides.en.splice(enGuide, 1);
const enProduct = products.findIndex((item) => item.locale === "en" && item.slug === "shared-stone"); products.splice(enProduct, 1);
delete pages.en.stoneworks;
assert.deepEqual((await adapters.getGuide("shared-care", "fa")).translationLocales, ["fa"]);
assert.deepEqual((await adapters.getProduct("shared-stone", "fa")).translationLocales, ["fa"]);
assert.deepEqual((await adapters.getPage("stoneworks", "fa")).translationLocales, ["fa"]);
sites.en = null;
const partialResponse = await sitemap.handleSitemapRequest(new Request("https://worker.example/sitemap.xml"),
  { PUBLIC_INDEXING: "true", SITE_URL: "https://example.com" });
assert.equal(partialResponse.status, 200);
const partialXml = await partialResponse.text();
assert.ok(partialXml.includes("<loc>https://example.com/</loc>"));
assert.equal(partialXml.includes("<loc>https://example.com/en</loc>"), false);
assert.equal(networkCalls, 0);
console.log("seo-runtime-passed");
`;
    const file = join(root, "seo-fixture.ts");
    await writeFile(file, source);
    const result = spawnSync(process.execPath, [file], {
      cwd: repository,
      encoding: "utf8",
      timeout: 20_000,
      env: { PATH: process.env["PATH"] ?? "", VITE_SITE_URL: "https://example.com" },
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "seo-runtime-passed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
