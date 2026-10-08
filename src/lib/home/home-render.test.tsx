import { test } from "node:test";
import assert from "node:assert/strict";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  RouterContextProvider,
} from "@tanstack/react-router";
import { LocaleProvider } from "@/lib/i18n/react";
import { BASE_STATIC_PATHS, localizePath, localizeRawPath } from "@/lib/i18n/locale";
import type { Locale } from "@/lib/i18n/locale";
import { contentListForLocale } from "@/lib/i18n/content-gate";
import { AppShell } from "@/components/layout/app-shell";
import { HomePage } from "@/components/home/home-page";
import { PublicMedia } from "@/components/media/public-media";
import { buildHomeViewModel } from "@/lib/home";
import { loadHomeViewModel } from "@/lib/home-editorial";
import type { Guide, Media, PortfolioItem } from "@/lib/content/types";
import { homeRouteOptions } from "@/lib/route-defs/pages";

const ARABIC = /[\u0600-\u06FF]/;
const EMPTY = { portfolioItems: [], guides: [] };

function renderUi(locale: Locale, children: ReactNode): string {
  const root = createRootRoute();
  const paths = [
    ...new Set(
      [...BASE_STATIC_PATHS, "/guides/$slug"].flatMap((path) => [
        localizeRawPath(path, "fa"),
        localizeRawPath(path, "en"),
      ]),
    ),
  ];
  const router = createRouter({
    routeTree: root.addChildren(
      paths.map((path) => createRoute({ getParentRoute: () => root, path })),
    ),
    history: createMemoryHistory({ initialEntries: [locale === "en" ? "/en" : "/"] }),
  });
  return renderToStaticMarkup(
    <RouterContextProvider router={router}>
      <LocaleProvider locale={locale}>{children}</LocaleProvider>
    </RouterContextProvider>,
  );
}

function media(stem: string): Media {
  const base = "/media/aaaaaaaaaaaaaaaaaaaaaaaa/" + stem;
  return {
    src: base + "-1280w.webp",
    srcSet: [320, 640, 1280]
      .map((width) => base + "-" + width + "w.webp " + width + "w")
      .join(", "),
    width: 1280,
    height: 1600,
    alt: "Stone surface",
  };
}

test("both locale homes render one shared heading, three service links and a complete no-media shell", () => {
  for (const locale of ["fa", "en"] as const) {
    const html = renderUi(
      locale,
      <AppShell site={null}>
        <HomePage model={buildHomeViewModel(EMPTY)} />
      </AppShell>,
    );
    assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
    assert.ok(
      html.includes(
        locale === "fa" ? "زیبایی سنگ، دقت ساخت." : "Natural stone. Crafted with care.",
      ),
    );
    for (const route of ["/grave-stones", "/building-stone", "/stoneworks"] as const)
      assert.ok(html.includes('href="' + localizePath(route, locale) + '"'));
    assert.ok(html.includes('href="#home-services"'));
    assert.ok(/id="home-services"[^>]*tabindex="-1"/.test(html));
    assert.equal(html.includes("<img"), false);
    assert.equal(html.includes('id="home-portfolio"'), false);
    assert.equal(html.includes('id="home-guide"'), false);
    if (locale === "en") assert.equal(ARABIC.test(html.replaceAll("فارسی", "")), false);
  }
});

test("a guide is selected after locale filtering so a Persian first item does not hide an English guide", () => {
  const guides: Guide[] = [
    {
      locale: "fa",
      slug: "care-fa",
      title: "راهنمای فارسی",
      summary: null,
      body: "",
      seo: null,
      updatedAt: "2026-01-01",
    },
    {
      locale: "en",
      slug: "care",
      title: "Stone care",
      summary: "Care for natural stone.",
      body: "",
      seo: null,
      updatedAt: "2026-01-01",
    },
  ];
  const model = buildHomeViewModel({ ...EMPTY, guides: contentListForLocale(guides, "en") });
  const html = renderUi("en", <HomePage model={model} />);
  assert.ok(html.includes('id="home-guide"'));
  assert.ok(html.includes('href="/en/guides/care"'));
  assert.ok(html.includes("Stone care"));
  assert.equal(ARABIC.test(html), false);
});

test("only three distinct editorial work references render the selected-work section", () => {
  const works: PortfolioItem[] = ["pf-1001", "pf-1002", "pf-1003"].map((publicReferenceId) => ({
    locale: "en",
    publicReferenceId,
    media: [media("aaaaaaaaaaaaaaaa")],
    summary: null,
  }));
  const selection = {
    projects: { memorial: "pf-1001", architectural: "pf-1002", bespoke: "pf-1003" },
  };
  const unselected = renderUi(
    "en",
    <HomePage model={buildHomeViewModel({ ...EMPTY, portfolioItems: works })} />,
  );
  assert.equal(unselected.includes('id="home-portfolio"'), false);
  for (const locale of ["fa", "en"] as const) {
    const selected = renderUi(
      locale,
      <HomePage
        model={buildHomeViewModel(
          { ...EMPTY, portfolioItems: works.map((item) => ({ ...item, locale })) },
          selection,
        )}
      />,
    );
    assert.ok(selected.includes('id="home-portfolio"'));
    for (const reference of ["pf-1001", "pf-1002", "pf-1003"])
      assert.ok(
        selected.includes(
          'href="' +
            localizePath("/quote", locale) +
            "?source=portfolio&amp;reference=" +
            reference +
            '"',
        ),
      );
    assert.equal((selected.match(/<img\b/g) ?? []).length, 3);
    if (locale === "en") assert.equal(ARABIC.test(selected), false);
  }
});

test("responsive hero media uses mobile picture sources before the desktop fallback and keeps intrinsic dimensions", () => {
  const desktop = media("aaaaaaaaaaaaaaaa");
  const mobile = { ...media("bbbbbbbbbbbbbbbb"), height: 853 };
  const html = renderToStaticMarkup(
    <PublicMedia media={desktop} mobileMedia={mobile} fit="contain" priority />,
  );
  assert.ok(html.indexOf("bbbbbbbbbbbbbbbb") < html.indexOf("aaaaaaaaaaaaaaaa-320w"));
  assert.equal((html.match(/media="\(max-width: 1023px\)"/g) ?? []).length, 2);
  assert.ok(html.includes('width="1280" height="1600"'));
  assert.ok(html.toLowerCase().includes('fetchpriority="high"'));
  assert.ok(html.includes("object-contain"));
});

test("resolved editorial images render seven complete frames, with an optional mobile source and one priority image", async () => {
  for (const locale of ["fa", "en"] as const) {
    const works: PortfolioItem[] = ["pf-1001", "pf-1002", "pf-1003"].map((publicReferenceId) => ({
      locale,
      publicReferenceId,
      media: [
        media("aaaaaaaaaaaaaaaa"),
        {
          ...media("bbbbbbbbbbbbbbbb"),
          src: "/media/" + "b".repeat(24) + "/bbbbbbbbbbbbbbbb-1280w.webp",
          srcSet: media("bbbbbbbbbbbbbbbb").srcSet.replaceAll("a".repeat(24), "b".repeat(24)),
          height: 853,
        },
      ],
    }));
    const model = await loadHomeViewModel(
      locale,
      {
        hero: { publicReferenceId: "pf-1001", assetId: "a".repeat(24) },
        heroMobile: { publicReferenceId: "pf-1001", assetId: "b".repeat(24) },
        services: {
          memorial: { publicReferenceId: "pf-1001", assetId: "a".repeat(24) },
          architectural: { publicReferenceId: "pf-1002", assetId: "a".repeat(24) },
          bespoke: { publicReferenceId: "pf-1003", assetId: "a".repeat(24) },
        },
        projects: { memorial: "pf-1001", architectural: "pf-1002", bespoke: "pf-1003" },
      },
      { getGuides: async () => [], getPortfolioItems: async () => works },
    );
    const html = renderUi(locale, <HomePage model={model} />);
    assert.equal((html.match(/<img\b/g) ?? []).length, 7);
    assert.equal((html.match(/object-contain/g) ?? []).length, 7);
    assert.equal((html.toLowerCase().match(/fetchpriority="high"/g) ?? []).length, 1);
    assert.equal((html.match(/loading="lazy"/g) ?? []).length, 6);
    assert.equal((html.match(/media="\(max-width: 1023px\)"/g) ?? []).length, 2);
    assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
    assert.equal(/style=|data:image|\/private\//.test(html), false);
    if (locale === "en") assert.equal(ARABIC.test(html), false);
  }
});

test("home metadata names all three services and contains no Persian on the English route", () => {
  for (const locale of ["fa", "en"] as const) {
    const metadata = JSON.stringify(homeRouteOptions(locale).head().meta);
    const labels =
      locale === "fa"
        ? ["سنگ مزار", "سنگ ساختمانی", "ساخت سفارشی"]
        : ["memorial", "architectural", "bespoke"];
    for (const label of labels) assert.ok(metadata.toLowerCase().includes(label));
    if (locale === "en") assert.equal(ARABIC.test(metadata), false);
  }
});
