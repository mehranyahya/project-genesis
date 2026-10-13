import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

test("real guide CLI, repository, eight adapters, home/list/detail loaders and bilingual SSR preserve review and absence", async () => {
  const repository = fileURLToPath(new URL("../../../", import.meta.url));
  const root = await mkdtemp(join(repository, ".git-guides-runtime-"));
  try {
    for (const directory of [
      "scripts",
      "content/pages/fa",
      "content/pages/en",
      "content/guides/fa",
      "content/guides/en",
      "src/lib/content",
      "supabase/functions/_shared",
    ])
      await mkdir(join(root, directory), { recursive: true });
    for (const name of [
      "generate-content-pages.mjs",
      "git-pages.mjs",
      "git-guides.mjs",
      "guide-links.mjs",
      "guide-policy.mjs",
    ])
      await copyFile(join(repository, "scripts", name), join(root, "scripts", name));
    for (const [locale, slug] of [
      ["fa", "stone-care"],
      ["en", "stone-care"],
      ["fa", "fa-only"],
      ["en", "en-only"],
    ]) {
      const meta = {
        slug,
        locale,
        title: `${locale} Synthetic guide ${slug}`,
        summary: `${locale} Synthetic summary`,
        status: "published",
        reviewed: true,
        version: "test-v1",
        updatedAt: slug === "stone-care" ? "2026-10-13" : "2026-10-12",
        seoTitle: `${locale} Real article SEO`,
        seoDescription: `${locale} Real description`,
        canonicalPath: `${locale === "en" ? "/en" : ""}/guides/${slug}`,
        robots: "noindex,follow",
      };
      const body = [
        "# Synthetic body heading",
        "",
        "Synthetic complete article body.",
        "",
        "- Synthetic item",
        "",
        `[Related service](${locale === "en" ? "/en" : ""}/building-stone)`,
        "",
        '<script>alert("synthetic")</script>',
      ].join("\n");
      await writeFile(
        join(root, `content/guides/${locale}/${slug}.md`),
        [
          "---",
          ...Object.entries(meta).map(([key, value]) => `${key}: ${JSON.stringify(value)}`),
          "---",
          body,
        ].join("\n"),
      );
    }
    const generated = spawnSync("node", ["scripts/generate-content-pages.mjs"], {
      cwd: root,
      encoding: "utf8",
      timeout: 15_000,
      env: { PATH: process.env["PATH"] ?? "" },
    });
    assert.equal(generated.error, undefined);
    assert.equal(generated.status, 0, generated.stderr);
    const script = `
import assert from "node:assert/strict";
import { mock } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { createRootRoute, createRoute, createRouter, createMemoryHistory, Outlet, RouterProvider } from "@tanstack/react-router";
import { LocaleProvider } from ${JSON.stringify(join(repository, "src/lib/i18n/react.tsx"))};
import { validateGuideLookup, validateGuideQuery } from ${JSON.stringify(join(repository, "src/lib/content/guide-lookup.ts"))};
const artifact = await import(${JSON.stringify(join(root, "src/lib/content/generated-guides.ts"))});
const guides = JSON.parse(JSON.stringify(artifact.GIT_GUIDES));
assert.equal(artifact.GUIDE_SOURCES_SUPPORTED, true);
mock.module(${JSON.stringify(join(repository, "src/lib/content/generated-guides.ts"))}, () => ({ GIT_GUIDES: guides, GUIDE_SOURCES_SUPPORTED: true }));
mock.module(${JSON.stringify(join(repository, "src/lib/home-editorial-config.ts"))}, () => ({ HOME_EDITORIAL_REFERENCES: { fa: {}, en: {} } }));
const repo = await import(${JSON.stringify(join(repository, "src/lib/content/guides.server.ts"))});
const calls = [];
mock.module(${JSON.stringify(join(repository, "src/lib/content/git.functions.ts"))}, () => ({
  getPageFromGitServer: async () => null,
  getGuidesFromGitServer: async ({ data }) => { const query = validateGuideQuery(data); calls.push({ kind: "list", ...query }); return repo.loadGitGuides(query); },
  getGuideFromGitServer: async ({ data }) => { const query = validateGuideLookup(data); calls.push({ kind: "detail", ...query }); return repo.loadGitGuide(query.slug, query.locale); },
}));
mock.module(${JSON.stringify(join(repository, "src/lib/content/supabase.functions.ts"))}, () => ({
  getProductsFromServer: async () => [], getProductFromServer: async () => null, getPortfolioItemsFromServer: async () => { throw new Error("Unconfigured home must not read portfolio"); },
  getSiteFromServer: async () => null, getCatalogVersionFromServer: async () => null,
}));
globalThis.fetch = async () => { throw new Error("No network in guide fixture"); };
const adapters = await import(${JSON.stringify(join(repository, "src/lib/content/adapters.ts"))});
assert.deepEqual(Object.keys(adapters).sort(), ["getCatalogVersion", "getGuide", "getGuides", "getPage", "getPortfolioItems", "getProduct", "getProducts", "getSite"]);
const routes = await import(${JSON.stringify(join(repository, "src/lib/route-defs/pages.tsx"))});
async function render(locale, path, options) {
  if (options.component.preload) await options.component.preload();
  const rootRoute = createRootRoute({ component: () => createElement(LocaleProvider, { locale }, createElement(Outlet)) });
  const routePath = path.endsWith("/guides/stone-care") ? path.replace(/stone-care$/, "$slug") : path;
  const route = createRoute({ getParentRoute: () => rootRoute, path: routePath, ...options });
  const router = createRouter({ routeTree: rootRoute.addChildren([route]), history: createMemoryHistory({ initialEntries: [path] }), isServer: true });
  await router.load(); assert.equal(router.state.matches.at(-1).status, "success", String(router.state.matches.at(-1).error?.stack));
  return renderToString(createElement(RouterProvider, { router }));
}
for (const locale of ["fa", "en"]) {
  const prefix = locale === "en" ? "/en" : "";
  const list = await adapters.getGuides({ locale });
  assert.equal(list.length, 2);
  assert.equal(list[0].slug, "stone-care");
  assert.deepEqual(Object.keys(list[0]).sort(), ["locale", "slug", "summary", "title", "updatedAt"]);
  assert.ok(list.every((item) => item.locale === locale));
  const detail = await adapters.getGuide("stone-care", locale);
  assert.equal(detail.locale, locale);
  assert.deepEqual(detail.translationLocales, []);
  assert.equal(Object.hasOwn(detail, "version"), false);
  const listOptions = routes.guideListRouteOptions(locale), detailOptions = routes.guideDetailRouteOptions(locale);
  const listData = await listOptions.loader();
  const { items } = listData;
  assert.equal(items[0].slug, "stone-care");
  if (locale === "en") assert.equal(items[0].updatedLabel, "13 October 2026");
  assert.ok(listOptions.head({ loaderData: listData }).meta.some((item) => item.name === "robots" && item.content === "noindex,follow"));
  assert.deepEqual(listOptions.head({ loaderData: listData }).links.filter((item) => item.rel === "alternate"), []);
  const model = await detailOptions.loader({ params: { slug: "stone-care" } });
  const head = detailOptions.head({ loaderData: model });
  assert.ok(head.meta.some((item) => item.title === locale + " Real article SEO"));
  assert.ok(head.meta.some((item) => item.name === "description" && item.content === locale + " Real description"));
  assert.ok(head.meta.some((item) => item.name === "robots" && item.content === "noindex,follow"));
  assert.ok(head.links.some((item) => item.rel === "canonical" && item.href.endsWith(prefix + "/guides/stone-care")));
  assert.deepEqual(head.links.filter((item) => item.rel === "alternate"), []);
  const listHtml = await render(locale, prefix + "/guides", listOptions);
  assert.ok(listHtml.includes('href="' + prefix + '/guides/stone-care"'));
  assert.equal(listHtml.includes("Synthetic complete article body."), false);
  const detailHtml = await render(locale, prefix + "/guides/stone-care", detailOptions);
  assert.equal((detailHtml.match(/<h1\\b/g) ?? []).length, 1);
  assert.ok(detailHtml.includes("Synthetic complete article body."));
  assert.ok(detailHtml.includes('href="' + prefix + '/building-stone"'));
  assert.ok(detailHtml.includes('href="' + prefix + '/quote"'));
  assert.ok(detailHtml.includes('datetime="2026-10-13"') || detailHtml.includes('dateTime="2026-10-13"'));
  assert.ok(detailHtml.includes("&lt;script&gt;"));
  assert.equal(detailHtml.includes('<script>alert("synthetic")</script>'), false);
  assert.ok(detailHtml.includes("max-w-[70ch]"));
  const homeOptions = routes.homeRouteOptions(locale), home = await homeOptions.loader();
  assert.equal(home.guide.title, locale + " Synthetic guide stone-care");
  assert.ok(calls.some((call) => call.kind === "list" && call.locale === locale && call.limit === 1));
  const homeHtml = await render(locale, locale === "en" ? "/en" : "/", homeOptions);
  assert.ok(homeHtml.includes('href="' + prefix + '/guides/stone-care"'));
  assert.equal(homeHtml.includes("Synthetic complete article body."), false);
  if (locale === "en") for (const html of [listHtml, detailHtml, homeHtml]) assert.doesNotMatch(html, /[\\u0600-\\u06FF]/);
}
assert.equal((await adapters.getGuide("stone-care")).locale, "fa");
const detailCopy = await adapters.getGuide("stone-care", "en"); detailCopy.seo.title = "Changed"; detailCopy.translationLocales.pop();
assert.equal((await adapters.getGuide("stone-care", "en")).seo.title, "en Real article SEO");
assert.deepEqual((await adapters.getGuide("stone-care", "en")).translationLocales, []);
const listCopy = await adapters.getGuides({ locale: "en" }); listCopy[0].summary = "Changed";
assert.equal((await adapters.getGuides({ locale: "en" }))[0].summary, "en Synthetic summary");
const faOnlyOptions = routes.guideDetailRouteOptions("fa"), faOnly = await faOnlyOptions.loader({ params: { slug: "fa-only" } });
assert.equal(faOnlyOptions.head({ loaderData: faOnly }).links.some((item) => item.hrefLang === "en"), false);
const enOnlyOptions = routes.guideDetailRouteOptions("en"), enOnly = await enOnlyOptions.loader({ params: { slug: "en-only" } });
assert.deepEqual(enOnlyOptions.head({ loaderData: enOnly }).links.filter((item) => item.rel === "alternate"), []);
guides.en.length = 0;
assert.deepEqual(await adapters.getGuides({ locale: "en" }), []);
assert.equal(await adapters.getGuide("stone-care", "en"), null);
assert.ok(await adapters.getGuide("stone-care", "fa"));
assert.equal((await routes.homeRouteOptions("en").loader()).showGuide, false);
assert.equal((await routes.homeRouteOptions("fa").loader()).showGuide, true);
const emptyList = await routes.guideListRouteOptions("en").loader();
assert.ok(routes.guideListRouteOptions("en").head({ loaderData: emptyList }).meta.some((item) => item.name === "robots" && item.content === "noindex,follow"));
await assert.rejects(() => routes.guideDetailRouteOptions("en").loader({ params: { slug: "stone-care" } }), (error) => error.isNotFound === true);
assert.equal(await repo.loadGitGuide("unknown", "fa"), null);
assert.equal(await repo.loadGitGuide("../bad", "fa"), null);
assert.equal(await repo.loadGitGuide("stone-care", "ar"), null);
assert.deepEqual(await repo.loadGitGuides({ locale: "ar" }), []);
assert.deepEqual(await repo.loadGitGuides({ limit: 0 }), []);
await assert.rejects(() => adapters.getGuide("../bad", "fa"));
console.log("git-guide-runtime-fixture-passed");
`;
    const file = join(root, "runtime-fixture.ts");
    await writeFile(file, script);
    const result = spawnSync(process.execPath, [file], {
      cwd: repository,
      encoding: "utf8",
      timeout: 30_000,
      env: { PATH: process.env["PATH"] ?? "" },
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "git-guide-runtime-fixture-passed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
