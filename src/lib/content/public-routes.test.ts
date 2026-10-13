import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPublicRouteAvailability, type PublicContentSnapshot } from "./public-routes";
import { validateSiteQuery } from "./site-query";
import type { Guide, Page, Product, Site } from "./types";
import { BASE_STATIC_PATHS, LOCALES, localizeRawPath, type Locale } from "../i18n/locale";
import { resolveLanguageTarget } from "../i18n/language-target";
import { staticRouteAvailability } from "../i18n/route-availability";
import { buildSitemapXml } from "../sitemap.server";
import { availableStaticHead } from "../route-defs/shared";
import { allowsIndexing } from "../seo-indexing";

function product(locale: Locale, slug = "synthetic-stone"): Product {
  return {
    locale,
    slug,
    id: "synthetic-product",
    code: "TEST-1",
    type: "simple",
    title: "Synthetic stone",
    summary: null,
    description: null,
    isActive: true,
    isFeatured: false,
    media: [],
    seo: null,
    updatedAt: "2026-10-13T01:02:03Z",
    variants: [
      {
        id: "synthetic-variant",
        stoneCode: "granite",
        sizeCode: "120x60",
        priceType: "review",
        amountToman: null,
        priceUpdatedAt: null,
        includes: [],
        excludes: [],
        options: [],
        isAvailable: true,
      },
    ],
  };
}
function guide(locale: Locale): Guide {
  return {
    locale,
    slug: "synthetic-care",
    title: "Synthetic care",
    summary: null,
    body: "Synthetic reviewed body.",
    updatedAt: "2026-10-13",
    seo: null,
  };
}
function page(locale: Locale, slug: Page["slug"] = "about"): Page {
  return { locale, slug, title: "Synthetic page", body: "Synthetic reviewed body.", seo: null };
}
function site(locale: Locale): Site {
  return {
    locale,
    displayName: "Synthetic brand",
    latinName: "Synthetic brand",
    phone: null,
    whatsappUrl: null,
    telegram: null,
    address: null,
    workingHours: null,
    links: { instagram: null, website: null, map: null },
  };
}
function snapshot(values: Partial<PublicContentSnapshot> = {}): PublicContentSnapshot {
  return { products: [], guides: [], pages: [], portfolioItems: [], sites: [], ...values };
}
function root(content: PublicContentSnapshot) {
  return [
    {
      routeId: "__root__",
      loaderData: { routeAvailability: buildPublicRouteAvailability(content) },
    },
  ];
}

test("an empty publication keeps both localized home and enquiry interfaces readable without search eligibility", () => {
  const available = buildPublicRouteAvailability(snapshot());
  assert.deepEqual(Object.keys(available), BASE_STATIC_PATHS);
  for (const path of BASE_STATIC_PATHS) {
    assert.deepEqual(available[path].indexableLocales, []);
    assert.deepEqual(
      available[path].readableLocales,
      ["/", "/quote", "/grave-stones/custom"].includes(path) ? LOCALES : [],
    );
  }
  for (const locale of LOCALES) {
    assert.deepEqual(
      resolveLanguageTarget("/quote", locale, {
        source: "stoneworks",
        category: "sculpture_art",
        name: "Private synthetic",
      }),
      {
        href: localizeRawPath("/quote", locale) + "?source=stoneworks&category=sculpture_art",
        isHomepageFallback: false,
      },
    );
  }
});

test("ready static metadata and sitemap agree for English-only, Persian-only and mixed publications", () => {
  const content = snapshot({
    products: [product("fa")],
    guides: [guide("en")],
    sites: [site("fa")],
    pages: [
      page("fa"),
      {
        ...page("en"),
        seo: {
          title: "Synthetic SEO",
          description: null,
          robots: "noindex,follow",
          canonicalPath: null,
        },
      },
    ],
  });
  const matches = root(content),
    xml = buildSitemapXml("https://example.com", content);
  for (const path of ["/", "/grave-stones", "/guides", "/portfolio"]) {
    for (const locale of LOCALES) {
      const head = availableStaticHead({ locale, basePath: path, title: "راهنماها" }, { matches });
      const robots = head.meta.find((item) => "name" in item && item.name === "robots")?.content;
      assert.equal(
        allowsIndexing(robots),
        xml.includes("<loc>https://example.com" + localizeRawPath(path, locale) + "</loc>"),
      );
      assert.equal(head.links.filter((link) => link.rel === "canonical").length, 1);
      const alt = head.links
        .filter((link) => link.rel === "alternate")
        .map((link) => link.hrefLang);
      assert.deepEqual(
        alt,
        allowsIndexing(robots) ? (path === "/guides" ? ["en"] : ["fa", "x-default"]) : [],
      );
    }
  }
  assert.deepEqual(resolveLanguageTarget("/about", "en", undefined, matches), {
    href: "/en/about",
    isHomepageFallback: false,
  });
  assert.deepEqual(resolveLanguageTarget("/guides", "fa", undefined, matches), {
    href: "/guides",
    isHomepageFallback: false,
  });
  assert.deepEqual(resolveLanguageTarget("/en/guides", "fa", undefined, matches), {
    href: "/",
    isHomepageFallback: true,
  });
});

test("noindex and noncanonical content remains readable while hidden content does not make a list search-ready", () => {
  const noindex = {
    title: "Synthetic SEO",
    description: null,
    robots: "noindex,follow",
    canonicalPath: null,
  };
  const content = snapshot({
    products: [{ ...product("en"), seo: noindex }],
    guides: [
      { ...guide("en"), seo: { ...noindex, robots: "index,follow", canonicalPath: "/quote" } },
    ],
    pages: [{ ...page("en"), seo: noindex }],
  });
  const available = buildPublicRouteAvailability(content);
  for (const path of ["/grave-stones", "/guides", "/about"] as const) {
    assert.deepEqual(available[path], { readableLocales: ["en"], indexableLocales: [] });
    assert.deepEqual(resolveLanguageTarget(path, "en", undefined, root(content)), {
      href: "/en" + path,
      isHomepageFallback: false,
    });
  }
});

test("inactive, duplicate, incomplete and reserved records never advertise a usable counterpart", () => {
  const content = snapshot({
    products: [
      { ...product("en"), isActive: false },
      { ...product("en", "no-variants"), variants: [] },
      product("en", "duplicate"),
      product("en", "duplicate"),
      product("en", "custom"),
    ],
    guides: [{ ...guide("en"), body: " " }],
    pages: [page("en"), page("en")],
    sites: [{ ...site("en"), displayName: " " }],
  });
  const available = buildPublicRouteAvailability(content);
  for (const path of ["/grave-stones", "/guides", "/about"] as const)
    assert.deepEqual(available[path], { readableLocales: [], indexableLocales: [] });
  assert.deepEqual(available["/"].indexableLocales, []);
  assert.deepEqual(resolveLanguageTarget("/grave-stones", "en", undefined, root(content)), {
    href: "/en",
    isHomepageFallback: true,
  });
});

test("fallback to the selected-language home drops even public selectors, all private values and fragments", () => {
  const search = {
    source: "portfolio",
    reference: "pf-1001",
    name: "Private synthetic",
    phone: "09120000000",
    token: "Private synthetic",
  };
  for (const path of [
    "/building-stone",
    "/grave-stones/fa-only",
    "/guides/fa-only",
    "/unknown#Private",
  ]) {
    const target = resolveLanguageTarget(path, "en", search, [
      { routeId: "__root__" },
      { routeId: path, loaderData: { readableLocales: ["fa"] } },
    ]);
    assert.deepEqual(target, { href: "/en", isHomepageFallback: true });
  }
  assert.deepEqual(resolveLanguageTarget("/en/unknown?name=Private#Private", "fa", search), {
    href: "/",
    isHomepageFallback: true,
  });
});

test("a real dynamic translation including noindex keeps only approved enquiry selectors and never a hash", () => {
  const matches = [
    { routeId: "__root__" },
    {
      routeId: "/grave-stones/$slug",
      loaderData: { readableLocales: ["fa", "en"], translationLocales: ["fa"] },
    },
  ];
  const target = resolveLanguageTarget(
    "/grave-stones/shared#Private",
    "en",
    {
      source: "portfolio",
      reference: "pf-1001",
      city: "Private synthetic",
    },
    matches,
  );
  assert.deepEqual(target, {
    href: "/en/grave-stones/shared?source=portfolio&reference=pf-1001",
    isHomepageFallback: false,
  });
  assert.deepEqual(
    resolveLanguageTarget(
      "/grave-stones/shared",
      "en",
      { source: "portfolio", reference: "../Private" },
      matches,
    ),
    { href: "/en/grave-stones/shared", isHomepageFallback: false },
  );
});

test("missing and malformed root metadata cannot assert language readiness or copy arbitrary route data", () => {
  for (const loaderData of [
    undefined,
    null,
    [],
    { routeAvailability: [] },
    { routeAvailability: { "/guides": { readableLocales: "en", indexableLocales: ["unknown"] } } },
  ]) {
    const matches = [{ routeId: "__root__", loaderData }];
    assert.deepEqual(staticRouteAvailability(matches, "/en/guides"), {
      readableLocales: [],
      indexableLocales: [],
    });
    assert.deepEqual(resolveLanguageTarget("/guides", "en", undefined, matches), {
      href: "/en",
      isHomepageFallback: true,
    });
  }
  const spoofed = [
    {
      routeId: "/guides",
      loaderData: {
        routeAvailability: { "/guides": { readableLocales: ["en"], indexableLocales: ["en"] } },
      },
    },
  ];
  assert.deepEqual(staticRouteAvailability(spoofed, "/guides"), {
    readableLocales: [],
    indexableLocales: [],
  });
});

test("the optional site query remains default-compatible and rejects invalid flags, locales and private input", () => {
  for (const input of [undefined, {}, { includeRouteAvailability: false }])
    assert.deepEqual(validateSiteQuery(input), { locale: "fa" });
  assert.deepEqual(validateSiteQuery({ locale: "en", includeRouteAvailability: true }), {
    locale: "en",
    includeRouteAvailability: true,
  });
  for (const input of [
    null,
    [],
    "en",
    { locale: "ar" },
    { includeRouteAvailability: "true" },
    { includeRouteAvailability: 1 },
    { includeRouteAvailability: null },
    { phone: "09120000000" },
  ])
    assert.throws(() => validateSiteQuery(input));
});
