import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";

import { HomePage } from "@/components/home/home-page";
import { RequestForm } from "@/components/request-form/request-form";
import { ProductMediaStage } from "@/components/product/product-media-stage";
import { buildHomeViewModel } from "@/lib/home";
import { LocaleProvider } from "@/lib/i18n/react";
import type { Locale } from "@/lib/i18n/locale";
import { productShareUrl } from "@/components/product/product-share";

async function renderView(locale: Locale, element: ReactNode): Promise<string> {
  const root = createRootRoute({
    component: () => (
      <LocaleProvider locale={locale}>
        <Outlet />
      </LocaleProvider>
    ),
  });
  const entry = createRoute({
    getParentRoute: () => root,
    path: locale === "en" ? "/en" : "/",
    component: () => element,
  });
  const router = createRouter({
    routeTree: root.addChildren([entry]),
    history: createMemoryHistory({ initialEntries: [locale === "en" ? "/en" : "/"] }),
  });
  await router.load();
  return renderToStaticMarkup(<RouterProvider router={router} />);
}

test("Persian empty home has one H1, three real service routes and no fake images", async () => {
  const html = await renderView("fa", <HomePage model={buildHomeViewModel({ guides: [] })} />);
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
  for (const route of ["/grave-stones", "/building-stone", "/stoneworks"]) {
    assert.equal((html.match(new RegExp(`href="${route}"`, "g")) ?? []).length, 1);
  }
  assert.ok(html.includes('href="#home-services"'));
  assert.ok(html.includes('id="home-services"'));
  assert.equal(html.includes("<img"), false);
});

test("English empty home has English copy and three localized service destinations", async () => {
  const html = await renderView("en", <HomePage model={buildHomeViewModel({ guides: [] })} />);
  assert.equal(/[\u0600-\u06ff]/.test(html), false);
  for (const route of ["/en/grave-stones", "/en/building-stone", "/en/stoneworks"]) {
    assert.ok(html.includes(`href="${route}"`));
  }
  assert.ok(html.includes("Natural stone. Crafted with care."));
});

test("English gallery controls and position do not leak Persian", () => {
  const first = {
    src: "/media/aaaaaaaaaaaaaaaaaaaaaaaa/bbbbbbbbbbbbbbbb-1280w.webp",
    srcSet: "",
    width: 1280,
    height: 1600,
    alt: "Stone",
  };
  const html = renderToStaticMarkup(
    <LocaleProvider locale="en">
      <ProductMediaStage media={[first, { ...first, src: first.src.replace("bbbb", "cccc") }]} />
    </LocaleProvider>,
  );
  assert.equal(/[\u0600-\u06ff]/.test(html), false);
  assert.ok(html.includes("1 of 2"));
  assert.ok(html.includes('width="1280"'));
  assert.ok(html.includes('height="1600"'));
});

test("English sharing preserves the active locale and stable product slug", () => {
  assert.equal(
    productShareUrl("model-a", "https://example.test", "en"),
    "https://example.test/en/grave-stones/model-a",
  );
});

test("English general and bespoke form labels contain no memorial-only or Persian copy", async () => {
  const html = await renderView(
    "en",
    <RequestForm
      source={{ kind: "contact", portfolioReferenceId: null }}
      site={null}
      termsDocument={null}
      notePrefix="Bespoke stonework: Sculpture"
    />,
  );
  assert.equal(/[\u0600-\u06ff]/.test(html), false);
  assert.ok(html.includes("Dimensions and making details"));
  assert.ok(html.includes("Project or installation location (optional)"));
  assert.ok(html.includes('href="/en/terms"'));
  assert.equal(html.includes("Cemetery"), false);
  assert.ok(html.includes('type="submit"'));
  assert.ok(html.includes("disabled"));
});
