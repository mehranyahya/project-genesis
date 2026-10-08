import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToString } from "react-dom/server";
import {
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { LocaleProvider } from "@/lib/i18n/react";
import type { Locale } from "@/lib/i18n/locale";
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
  for (const locale of ["fa", "en"] as const) {
    const root = createRootRoute({
      component: () => (
        <LocaleProvider locale={locale}>
          <Outlet />
        </LocaleProvider>
      ),
    });
    const path = locale === "en" ? "/en" : "/";
    assert.equal(pages.homeRouteOptions(locale).component.name, "HomeRoute");
    const route = createRoute({
      getParentRoute: () => root,
      path,
      ...pages.homeRouteOptions(locale),
    });
    const router = createRouter({
      routeTree: root.addChildren([route]),
      history: createMemoryHistory({ initialEntries: [path] }),
      isServer: true,
    });
    await router.load();
    assert.equal(router.state.matches.at(-1)?.status, "success");
    const html = renderToString(<RouterProvider router={router} />);
    assert.match(html, /<h1/);
    assert.ok(
      html.includes(
        locale === "en" ? "Natural stone. Crafted with care." : "زیبایی سنگ، دقت ساخت.",
      ),
    );
    if (locale === "en") assert.doesNotMatch(html, /[\u0600-\u06FF]/);
    assert.doesNotMatch(html, /renderToString does not support Suspense/);
    const links = pages.homeRouteOptions(locale).head().links;
    assert.equal(links.filter((link) => link.rel === "canonical").length, 1);
    assert.equal(links.filter((link) => link.rel === "alternate").length, 3);
  }
});
