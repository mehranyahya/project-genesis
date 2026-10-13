import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as pages from "./pages";
import { FACTORY_SOURCE } from "./route-test-source";

test("secondary page factories expose pre-loadable views and named exports that resolve", async () => {
  const declarations = [
    ...FACTORY_SOURCE.matchAll(/lazyRouteComponent\(\s*\(\) => import\("([^"]+)"\),\s*"([^"]+)"/g),
  ];
  assert.ok(declarations.length > 0);
  for (const [, importer, exportName] of declarations) {
    const module = await import(importer!);
    assert.equal(typeof module[exportName!], "function", `${importer}: ${exportName}`);
  }
  const factories = [
    pages.stoneworksRouteOptions,
    pages.graveStoneListRouteOptions,
    pages.customFunnelRouteOptions,
    pages.productDetailRouteOptions,
    pages.portfolioRouteOptions,
    pages.buildingStoneRouteOptions,
    pages.quoteRouteOptions,
    pages.guideListRouteOptions,
    pages.guideDetailRouteOptions,
    pages.aboutRouteOptions,
    pages.privacyRouteOptions,
    pages.termsRouteOptions,
    pages.contactRouteOptions,
  ];
  for (const factory of factories) {
    for (const locale of ["fa", "en"] as const) {
      const options = factory(locale);
      for (const view of [
        options.component,
        "pendingComponent" in options ? options.pendingComponent : undefined,
        "errorComponent" in options ? options.errorComponent : undefined,
      ]) {
        if (!view) continue;
        assert.equal(typeof view.preload, "function", factory.name);
        await view.preload!();
      }
    }
  }
});

test("the critical home view renders on the server in both languages without an extra lazy boundary", async () => {
  // Isolate transport for source functions that require the Start transform.
  // Keep the real compiled empty source, adapters, factory, loader and view.
  const repository = fileURLToPath(new URL("../../../", import.meta.url));
  const directory = await mkdtemp(join(repository, ".home-critical-runtime-"));
  try {
    const script = `
import assert from "node:assert/strict";
import { mock } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { createRootRoute, createRoute, createRouter, createMemoryHistory, Outlet, RouterProvider } from "@tanstack/react-router";
import { LocaleProvider } from ${JSON.stringify(join(repository, "src/lib/i18n/react.tsx"))};
import { validateGuideLookup, validateGuideQuery } from ${JSON.stringify(join(repository, "src/lib/content/guide-lookup.ts"))};
mock.module(${JSON.stringify(join(repository, "src/lib/content/generated-guides.ts"))}, () => ({ GIT_GUIDES: { fa: [], en: [] }, GUIDE_SOURCES_SUPPORTED: true }));
mock.module(${JSON.stringify(join(repository, "src/lib/home-editorial-config.ts"))}, () => ({ HOME_EDITORIAL_REFERENCES: { fa: {}, en: {} } }));
const { loadGitGuide, loadGitGuides } = await import(${JSON.stringify(join(repository, "src/lib/content/guides.server.ts"))});
mock.module(${JSON.stringify(join(repository, "src/lib/content/git.functions.ts"))}, () => ({
  getPageFromGitServer: async () => null,
  getGuidesFromGitServer: async ({ data }) => loadGitGuides(validateGuideQuery(data)),
  getGuideFromGitServer: async ({ data }) => { const query = validateGuideLookup(data); return loadGitGuide(query.slug, query.locale); },
}));
globalThis.fetch = async () => { throw new Error("No network in critical home fixture"); };
const pages = await import(${JSON.stringify(join(repository, "src/lib/route-defs/pages.tsx"))});
for (const locale of ["fa", "en"]) {
  const root = createRootRoute({ component: () => createElement(LocaleProvider, { locale }, createElement(Outlet)) });
  const path = locale === "en" ? "/en" : "/";
  assert.equal(pages.homeRouteOptions(locale).component.name, "HomeRoute");
  const route = createRoute({ getParentRoute: () => root, path, ...pages.homeRouteOptions(locale) });
  const router = createRouter({ routeTree: root.addChildren([route]), history: createMemoryHistory({ initialEntries: [path] }), isServer: true });
  await router.load(); assert.equal(router.state.matches.at(-1).status, "success");
  const html = renderToString(createElement(RouterProvider, { router }));
  assert.equal((html.match(/<h1\\b/g) ?? []).length, 1);
  assert.ok(html.includes(locale === "en" ? "Natural stone. Crafted with care." : "زیبایی سنگ، دقت ساخت."));
  if (locale === "en") assert.doesNotMatch(html, /[\\u0600-\\u06FF]/);
  assert.doesNotMatch(html, /renderToString does not support Suspense/);
  assert.equal(html.includes('id="home-guide"'), false);
  const links = pages.homeRouteOptions(locale).head().links;
  assert.equal(links.filter((link) => link.rel === "canonical").length, 1);
  assert.equal(links.filter((link) => link.rel === "alternate").length, 3);
}
console.log("critical-home-runtime-passed");
`;
    const file = join(directory, "critical-fixture.ts");
    await writeFile(file, script);
    const result = spawnSync(process.execPath, [file], {
      cwd: repository,
      encoding: "utf8",
      timeout: 15_000,
      env: { PATH: process.env["PATH"] ?? "" },
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "critical-home-runtime-passed");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
