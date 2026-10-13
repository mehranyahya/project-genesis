import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

import {
  buildSitemapXml,
  handleSitemapRequest,
  normalizeSiteUrl,
  SITEMAP_PAGE_SLUGS,
  type SitemapContent,
} from "./sitemap.server";
import { BASE_STATIC_PATHS, localizeRawPath, type Locale } from "./i18n/locale";
import type { Guide, Page, PortfolioItem, Product, Site } from "./content/types";

const origin = "https://example.com";
function product(locale: Locale, slug = "test-stone"): Product {
  return {
    locale,
    slug,
    id: "test-product",
    code: "TEST-1",
    type: "simple",
    title: "Synthetic product",
    summary: null,
    description: null,
    isActive: true,
    isFeatured: false,
    media: [],
    seo: null,
    updatedAt: "2026-10-13T01:02:03Z",
    variants: [
      {
        id: "test-variant",
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
function guide(locale: Locale, slug = "test-care"): Guide {
  return {
    locale,
    slug,
    title: "Synthetic guide",
    summary: null,
    body: "Synthetic approved body.",
    seo: null,
    updatedAt: "2026-10-13",
  };
}
function page(locale: Locale, slug: Page["slug"]): Page {
  return {
    locale,
    slug,
    title: "Synthetic page",
    body: "Synthetic approved body.",
    seo: null,
    ...(slug === "stoneworks" ? { stoneworkCategories: ["sculpture_art" as const] } : {}),
  };
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
function portfolio(locale: Locale): PortfolioItem {
  return {
    locale,
    publicReferenceId: "pf-1001",
    media: [
      {
        src: "/media/aaaaaaaaaaaaaaaaaaaaaaaa/aaaaaaaaaaaaaaaa-1280w.webp",
        srcSet: "",
        width: 1280,
        height: 1600,
        alt: "Synthetic stone",
      },
    ],
  };
}
function snapshot(values: Partial<SitemapContent> = {}): SitemapContent {
  return { products: [], guides: [], pages: [], portfolioItems: [], sites: [], ...values };
}
function complete(): SitemapContent {
  return snapshot({
    products: ["fa", "en"].map((locale) => product(locale as Locale)),
    guides: ["fa", "en"].map((locale) => guide(locale as Locale)),
    pages: ["fa", "en"].flatMap((locale) =>
      SITEMAP_PAGE_SLUGS.map((slug) => page(locale as Locale, slug)),
    ),
    sites: ["fa", "en"].map((locale) => site(locale as Locale)),
    portfolioItems: ["fa", "en"].map((locale) => portfolio(locale as Locale)),
  });
}
function paths(xml: string): string[] {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1]!).pathname);
}
function seo(robots: string | null, canonicalPath: string | null = null) {
  return { title: "Synthetic SEO", description: null, robots, canonicalPath };
}

test("SITE_URL accepts only a clean HTTPS origin", () => {
  assert.equal(normalizeSiteUrl(origin), origin);
  assert.equal(normalizeSiteUrl(origin + "/"), origin);
  for (const invalid of [
    "http://example.com",
    "https://user@example.com",
    "https://example.com/path",
    "https://example.com/?query=1",
    "https://example.com/#hash",
    "not-a-url",
  ]) {
    assert.throws(() => normalizeSiteUrl(invalid));
  }
});

test("empty approved content produces no invented static or dynamic sitemap URLs", () => {
  const xml = buildSitemapXml(origin, snapshot());
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.deepEqual(paths(xml), []);
  assert.equal(xml.includes("stoneworks"), false);
});

test("ready static pages follow the bilingual route contract and include both detail families", () => {
  const xml = buildSitemapXml(origin, complete());
  const utilities = ["/quote", "/grave-stones/custom"];
  const expected = ["fa", "en"]
    .flatMap((locale) =>
      [
        ...BASE_STATIC_PATHS.filter((path) => !utilities.includes(path)),
        "/grave-stones/test-stone",
        "/guides/test-care",
      ].map((path) => localizeRawPath(path, locale as Locale)),
    )
    .sort();
  assert.deepEqual(paths(xml), expected);
  assert.ok(paths(xml).includes("/en/stoneworks"));
  assert.ok(paths(xml).includes("/en/grave-stones/test-stone"));
  assert.ok(paths(xml).includes("/en/guides/test-care"));
  for (const disallowed of [
    "/api/",
    "/quote",
    "/grave-stones/custom",
    "$slug",
    "priority",
    "changefreq",
  ])
    assert.equal(xml.includes(disallowed), false, disallowed);
});

test("a single English publication never fabricates the Persian counterpart", () => {
  const xml = buildSitemapXml(
    origin,
    snapshot({
      sites: [site("en")],
      products: [product("en")],
      guides: [guide("en")],
      pages: [page("en", "building-stone")],
    }),
  );
  assert.deepEqual(paths(xml), [
    "/en",
    "/en/building-stone",
    "/en/grave-stones",
    "/en/grave-stones/test-stone",
    "/en/guides",
    "/en/guides/test-care",
  ]);
});

test("inactive, unavailable, malformed, reserved, noncanonical and noindex products are excluded", () => {
  const candidates = [
    { ...product("fa", "inactive"), isActive: false },
    product("fa", "INVALID SLUG"),
    product("fa", "../escape"),
    product("fa", "private?name=person"),
    product("fa", "custom"),
    { ...product("fa", "unavailable"), variants: [] },
    { ...product("fa", "blank-title"), title: " " },
    { ...product("fa", "wrong-canonical"), seo: seo(null, "/quote") },
    { ...product("fa", "external-canonical"), seo: seo(null, "https://other.example/stone") },
    { ...product("fa", "hidden"), seo: seo(" NoIndex , follow ") },
    { ...product("fa", "none"), seo: seo("NONE") },
    { ...product("fa", "invalid-locale"), locale: "ar" },
  ];
  assert.deepEqual(paths(buildSitemapXml(origin, snapshot({ products: candidates }))), []);
});

test("same-locale duplicate products are omitted without hiding the unique other locale", () => {
  const fa = product("fa"),
    en = product("en");
  const xml = buildSitemapXml(origin, snapshot({ products: [fa, { ...fa, id: "other" }, en] }));
  assert.deepEqual(paths(xml), ["/en/grave-stones", "/en/grave-stones/test-stone"]);
});

test("legacy product labels stay Persian and invalid labels never become a Persian fallback", () => {
  const { locale: _locale, ...legacy } = product("fa");
  assert.deepEqual(paths(buildSitemapXml(origin, snapshot({ products: [legacy] }))), [
    "/grave-stones",
    "/grave-stones/test-stone",
  ]);
  for (const locale of ["", "FA", "en-US", "invalid"])
    assert.deepEqual(
      paths(buildSitemapXml(origin, snapshot({ products: [{ ...legacy, locale }] }))),
      [],
    );
});

test("static pages need real same-locale body, canonical and approved service categories", () => {
  const { stoneworkCategories: _categories, ...unapprovedService } = page("fa", "stoneworks");
  const { locale: _locale, ...unlabelledPage } = page("fa", "contact");
  const candidates = [
    { ...page("fa", "about"), body: " " },
    { ...page("en", "contact"), seo: seo("noindex,follow") },
    { ...page("en", "building-stone"), seo: seo(null, "/building-stone") },
    unapprovedService,
    unlabelledPage,
    { ...page("fa", "privacy"), title: "" },
    page("fa", "not-found"),
    page("fa", "home"),
  ];
  assert.deepEqual(paths(buildSitemapXml(origin, snapshot({ pages: candidates }))), []);
});

test("duplicate static pages and invalid site identity cannot advertise a home or service", () => {
  const a = page("en", "about");
  const data = snapshot({
    pages: [a, { ...a }],
    sites: [
      { ...site("en"), locale: "ar" },
      { ...site("fa"), displayName: "" },
    ],
  });
  assert.deepEqual(paths(buildSitemapXml(origin, data)), []);
});

test("guides exclude missing body, invalid slug, duplicates, noindex and mismatched canonical", () => {
  const a = guide("en", "duplicate");
  const data = snapshot({
    guides: [
      { ...guide("fa", "empty"), body: " " },
      guide("fa", "bad/slug"),
      { ...guide("fa", "hidden"), seo: seo("noindex,follow") },
      { ...guide("en", "wrong-canonical"), seo: seo(null, "/guides/wrong-canonical") },
      { ...guide("en", "no-title"), title: "" },
      a,
      { ...a },
    ],
  });
  assert.deepEqual(paths(buildSitemapXml(origin, data)), []);
});

test("portfolio index pages require at least one public card in the actual locale", () => {
  const data = snapshot({
    portfolioItems: [
      { ...portfolio("fa"), media: [] },
      portfolio("en"),
      { ...portfolio("fa"), publicReferenceId: "private-object" },
    ],
  });
  assert.deepEqual(paths(buildSitemapXml(origin, data)), ["/en/portfolio"]);
});

test("lastmod uses strict source guide dates and omits all unproven product/static timestamps", () => {
  const dates = ["2024-02-29", "2026-10-13T01:02:03.000Z", "2026-10-13T01:02:03+03:30"];
  const guides = dates.map((updatedAt, i) => ({ ...guide("en", "date-" + i), updatedAt }));
  const xml = buildSitemapXml(
    origin,
    snapshot({ products: [product("fa")], guides, pages: [page("en", "about")] }),
  );
  assert.deepEqual(
    [...xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1]),
    ["2024-02-29", "2026-10-13T01:02:03.000Z", "2026-10-12T21:32:03.000Z"],
  );
  for (const bad of [
    "2026-02-29",
    "2026-02-30",
    "2026-13-01",
    "2026-10-32",
    "10/13/2026",
    "2026-10-13T25:00:00Z",
    "2026-10-13T01:60:00Z",
    "2026-10-13T01:02:60Z",
    "2026-10-13T01:02:03",
    "2026-10-13T01:02:03+24:00",
    "0000-01-01",
    "bad",
    "",
  ]) {
    const candidate = buildSitemapXml(
      origin,
      snapshot({ guides: [{ ...guide("fa"), updatedAt: bad }] }),
    );
    assert.ok(paths(candidate).includes("/guides/test-care"), bad);
    assert.equal(candidate.includes("<lastmod>"), false, bad);
  }
});

test("URL order and lastmod are stable across input order with no generation-time dates", () => {
  const data = complete();
  const reversed = Object.fromEntries(
    Object.entries(data).map(([key, values]) => [key, [...values].reverse()]),
  ) as unknown as SitemapContent;
  assert.equal(buildSitemapXml(origin, data), buildSitemapXml(origin, reversed));
  assert.equal(
    new Set(paths(buildSitemapXml(origin, data))).size,
    paths(buildSitemapXml(origin, data)).length,
  );
});

test("sitemap XML parses with a real namespace-aware parser and no injected or oversized URLs", () => {
  const xml = buildSitemapXml(
    origin,
    snapshot({
      ...complete(),
      products: [
        ...complete().products,
        product("fa", "a".repeat(2048)),
        product("fa", 'bad"><script>'),
      ],
    }),
  );
  const python = [
    "import sys, xml.etree.ElementTree as E",
    "root=E.fromstring(sys.stdin.buffer.read())",
    "ns={'s':'http://www.sitemaps.org/schemas/sitemap/0.9'}",
    "assert root.tag=='{'+ns['s']+'}urlset'",
    "urls=root.findall('s:url',ns)",
    "assert len(urls)==24",
    "for node in urls:",
    "    loc=node.find('s:loc',ns).text",
    "    assert loc.startswith('https://example.com/')",
    "    assert len(loc)<2048 and '?' not in loc and '#' not in loc",
    "print('xml-valid')",
  ].join("\n");
  const result = spawnSync("python3", ["-c", python], {
    input: xml,
    encoding: "utf8",
    timeout: 5_000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "xml-valid");
});

test("preview sitemap fails closed before content is loaded for every disabled indexing value", async () => {
  let loads = 0;
  for (const PUBLIC_INDEXING of [undefined, "", "false", "TRUE", " true-but-not-enabled "]) {
    const response = await handleSitemapRequest(
      new Request("https://preview.example/sitemap.xml"),
      { PUBLIC_INDEXING, SITE_URL: "https://preview.example" },
      {
        loadContent: async () => {
          loads++;
          return complete();
        },
      },
    );
    assert.equal(response?.status, 404);
    assert.equal(response?.headers.get("cache-control"), "no-store, max-age=0");
  }
  assert.equal(loads, 0);
});

test("production sitemap requires a valid SITE_URL before loading content", async () => {
  let loads = 0;
  for (const SITE_URL of [
    undefined,
    "http://example.com",
    "https://user@example.com",
    "https://example.com/path",
  ]) {
    const response = await handleSitemapRequest(
      new Request("https://worker.example/sitemap.xml"),
      { PUBLIC_INDEXING: "true", SITE_URL },
      {
        loadContent: async () => {
          loads++;
          return complete();
        },
      },
    );
    assert.equal(response?.status, 503);
  }
  assert.equal(loads, 0);
});

test("production sitemap uses SITE_URL instead of request host or request query", async () => {
  const response = await handleSitemapRequest(
    new Request("https://worker-preview-host.example/sitemap.xml?name=private"),
    { PUBLIC_INDEXING: "true", SITE_URL: origin },
    { loadContent: async () => complete() },
  );
  assert.equal(response?.status, 200);
  assert.equal(response?.headers.get("content-type"), "application/xml; charset=utf-8");
  assert.equal(response?.headers.get("cache-control"), "public, max-age=300, s-maxage=3600");
  assert.equal(response?.headers.get("x-content-type-options"), "nosniff");
  const xml = await response!.text();
  assert.equal(xml, buildSitemapXml(origin, complete()));
  assert.equal(xml.includes("worker-preview-host"), false);
  assert.equal(xml.includes("private"), false);
});

test("an empty indexable publication is unavailable instead of an empty cacheable production sitemap", async () => {
  const response = await handleSitemapRequest(
    new Request(origin + "/sitemap.xml"),
    { PUBLIC_INDEXING: "true", SITE_URL: origin },
    { loadContent: async () => snapshot() },
  );
  assert.equal(response?.status, 503);
  assert.equal(response?.headers.get("cache-control"), "no-store, max-age=0");
  assert.equal(await response!.text(), "Service Unavailable");
});

test("content errors fail closed without exposing their message", async () => {
  const response = await handleSitemapRequest(
    new Request(origin + "/sitemap.xml"),
    { PUBLIC_INDEXING: "true", SITE_URL: origin },
    {
      loadContent: async () => {
        throw new Error("Synthetic private diagnostic");
      },
    },
  );
  assert.equal(response?.status, 503);
  assert.equal(await response!.text(), "Service Unavailable");
});

test("non-sitemap requests and unsupported methods retain the existing Worker delegation", async () => {
  let loads = 0;
  for (const [path, method] of [
    ["/about", "GET"],
    ["/sitemap.xml", "POST"],
    ["/sitemap.xml", "HEAD"],
  ] as const) {
    const response = await handleSitemapRequest(
      new Request(origin + path, { method }),
      { PUBLIC_INDEXING: "true", SITE_URL: origin },
      {
        loadContent: async () => {
          loads++;
          return complete();
        },
      },
    );
    assert.equal(response, null);
  }
  assert.equal(loads, 0);
});
