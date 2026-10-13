import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

test("real route loaders and framework HTTP renderer preserve 200/404, safe social metadata and inert Article data in both languages", async () => {
  const repository = fileURLToPath(new URL("../../", import.meta.url));
  const directory = await mkdtemp(join(repository, ".seo-absence-runtime-"));
  try {
    const script = `
import assert from "node:assert/strict";
import { mock } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { QueryClient } from "@tanstack/react-query";
import { createRootRoute, createRoute, createRouter, createMemoryHistory, HeadContent, RouterProvider } from "@tanstack/react-router";
import { attachRouterServerSsrUtils } from "@tanstack/router-core/ssr/server";
import { defaultRenderHandler } from "@tanstack/react-start-server";
const nonce = "0123456789abcdef0123456789abcdef";
const title = "Synthetic </script><script>synthetic</script> & heading";
function product(locale) {
  return { locale, slug: "shared-stone", id: "test-product", code: "TEST-1", type: "simple",
    title: "Synthetic product", summary: null, description: null, isActive: true, isFeatured: false,
    media: [], updatedAt: "2026-10-13T01:02:03Z", seo: null,
    variants: [{ id: "test-variant", stoneCode: "granite", sizeCode: "120x60", priceType: "review",
      amountToman: null, priceUpdatedAt: null, includes: [], excludes: [], options: [], isAvailable: true }] };
}
function guide(locale, slug = "shared-care", robots = "index,follow") {
  return { locale, slug, title, summary: "Synthetic summary", body: "Synthetic reviewed article.",
    updatedAt: "2026-10-13", seo: { title: locale + " Search title", description: null, robots, canonicalPath: null } };
}
mock.module("../src/lib/content/generated-structured-content.ts", () => ({
  GENERATED_PRODUCTS: [product("fa"),product("en")], GENERATED_PORTFOLIO_ITEMS: [],
  GENERATED_BUILDING_MEDIA: { fa: [], en: [] }, GENERATED_SITE: null, GENERATED_SITES: { fa: null, en: null },
  GENERATED_CATALOG_VERSION: null, STRUCTURED_CONTENT_GENERATED: true, STRUCTURED_TRANSLATIONS_SUPPORTED: true,
}));
mock.module("../src/lib/content/generated-guides.ts", () => ({
  GIT_GUIDES: { fa: [guide("fa"), guide("fa", "hidden-care", "noindex,follow")],
    en: [guide("en"), guide("en", "hidden-care", "noindex,follow")] }, GUIDE_SOURCES_SUPPORTED: true,
}));
mock.module("../src/lib/content/generated-pages.ts", () => ({ GIT_PAGES: { fa: {}, en: {} } }));
mock.module("@tanstack/react-start", () => ({ createServerFn: () => {
  let validator = (data) => data;
  const builder = { validator: (fn) => { validator = fn; return builder; },
    handler: (fn) => async (input = {}) => fn({ data: validator(input.data) }) };
  return builder;
} }));
mock.module("../src/styles.css?url", () => ({ default: "/synthetic-test.css" }));
let fetchCalls = 0;
globalThis.fetch = async () => { fetchCalls++; throw new Error("Offline metadata test rejected network"); };
const realRoot = (await import("../src/routes/__root.tsx")).Route;
const pages = await import("../src/lib/route-defs/pages.tsx");
function Shell({ children }) {
  return createElement("html", null, createElement("head", null, createElement(HeadContent)), createElement("body", null, children));
}
async function routerFor(path) {
  const root = createRootRoute({ ...realRoot.options, shellComponent: Shell });
  const children = [];
  for (const locale of ["fa", "en"]) {
    const prefix = locale === "en" ? "/en" : "";
    for (const [pattern, factory] of [["/grave-stones/$slug",pages.productDetailRouteOptions],["/guides/$slug",pages.guideDetailRouteOptions],["/guides",pages.guideListRouteOptions]]) {
      const options = factory(locale); if (options.component.preload) await options.component.preload();
      children.push(createRoute({ getParentRoute: () => root, path: prefix + pattern, ...options }));
    }
  }
  const router = createRouter({ routeTree: root.addChildren(children),
    history: createMemoryHistory({ initialEntries: [path] }), isServer: true,
    context: { queryClient: new QueryClient() }, ssr: { nonce } });
  attachRouterServerSsrUtils({ router, manifest: { routes: {} } });
  await router.load();
  return router;
}
async function http(path) {
  const router = await routerFor(path);
  const headers = new Headers({ "Content-Type": "text/html; charset=utf-8",
    ...router.state.matches[0].headers });
  const response = await defaultRenderHandler({ router, request: new Request("https://example.com" + path), responseHeaders: headers });
  return { response, html: await response.text() };
}
for (const locale of ["fa", "en"]) {
  const prefix = locale === "en" ? "/en" : "";
  for (const path of ["/grave-stones/missing", "/guides/missing", "/unknown", "/guides/../missing"]) {
    const {response,html} = await http(prefix + path + "?phone=PrivateSynthetic#PrivateSynthetic");
    assert.equal(response.status, 404, path);
    assert.ok(html.includes('name="robots" content="noindex,follow"'), html);
    assert.doesNotMatch(html, /rel="canonical"|rel="alternate"|application\\/ld\\+json|property="og:url"|PrivateSynthetic/);
  }
  const path = prefix + "/guides/shared-care";
  const {response,html} = await http(path);
  assert.equal(response.status,200);
  assert.ok(response.headers.get("content-security-policy").includes("nonce-" + nonce));
  assert.ok(html.includes('property="og:locale" content="' + (locale==="fa"?"fa_IR":"en_US") + '"'));
  assert.equal((html.match(/property="og:type"/g)??[]).length,1);
  assert.ok(html.includes('property="og:type" content="article"'));
  const block = html.match(/<script([^>]*)type="application\\/ld\\+json"([^>]*)>([\\s\\S]*?)<\\/script>/);
  if (process.env.VITE_SITE_URL) {
    assert.ok(html.includes('property="og:url" content="https://example.com' + path + '"'));
    assert.ok(block,html);assert.ok((block[1]+block[2]).includes('nonce="' + nonce + '"'));
    assert.equal(JSON.parse(block[3]).headline,title);
    assert.equal(JSON.parse(block[3]).inLanguage,locale);
    assert.doesNotMatch(block[3],/<script|<\\/script|author|image|datePublished|offers|rating/);
  } else {
    assert.equal(block,null); assert.equal(html.includes('property="og:url"'),false);
    assert.ok(html.includes('rel="canonical" href="' + path + '"'));
  }
  const hidden = await http(prefix + "/guides/hidden-care");
  assert.equal(hidden.response.status,200);
  assert.ok(hidden.html.includes("Synthetic reviewed article."));
  assert.equal(hidden.html.includes("application/ld+json"),false);
  assert.ok(hidden.html.includes('content="noindex,follow"'));
  const router = await routerFor(path);
  await router.navigate({ to: prefix + "/guides/missing" });
  await router.load();
  const missingHtml = renderToString(createElement(RouterProvider,{router}));
  assert.equal(router.state.statusCode,404);
  assert.doesNotMatch(missingHtml,/application\\/ld\\+json|rel="canonical"|property="og:url"|Search title/);
  assert.ok(missingHtml.includes('content="noindex,follow"'));
}
assert.equal(fetchCalls,0);
console.log("metadata-absence-runtime-passed");
`;
    const file = join(directory, "fixture.ts");
    await writeFile(file, script);
    for (const origin of ["https://example.com", ""]) {
      const result = spawnSync(process.execPath, [file], {
        cwd: repository,
        encoding: "utf8",
        timeout: 30_000,
        env: { PATH: process.env["PATH"] ?? "", VITE_SITE_URL: origin },
      });
      assert.equal(result.error, undefined);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout.trim(), "metadata-absence-runtime-passed");
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
