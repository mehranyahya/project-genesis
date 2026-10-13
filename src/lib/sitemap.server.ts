import { loadPortfolioItems, loadProducts, loadSite } from "./content/supabase.server";
import { loadGitPage } from "./content/git.server";
import { loadGitGuide, loadGitGuides } from "./content/guides.server";
import type { Guide, Page, PageSlug, PortfolioItem, Product, Site } from "./content/types";
import {
  hasLocalizedSite,
  isIndexableGuide,
  isIndexablePage,
  isIndexableProduct,
} from "./content/indexability";
import { BASE_STATIC_PATHS, LOCALES, localizeRawPath } from "./i18n/locale";
import { buildPortfolioModel } from "./portfolio";

/** Utility request flows and the not-found document are deliberately excluded. */
export const SITEMAP_PAGE_SLUGS = [
  "about",
  "building-stone",
  "contact",
  "privacy",
  "stoneworks",
  "terms",
] as const satisfies readonly PageSlug[];

export interface SitemapContent {
  readonly products: readonly Product[];
  readonly guides: readonly Guide[];
  readonly pages: readonly Page[];
  readonly portfolioItems: readonly PortfolioItem[];
  readonly sites: readonly Site[];
}

type SitemapDependencies = {
  readonly loadContent: () => Promise<SitemapContent>;
};

function envString(env: unknown, name: string): string | null {
  if (env === null || typeof env !== "object") return null;
  const value = (env as Record<string, unknown>)[name];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export function normalizeSiteUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("SITE_URL must be a valid URL");
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.pathname !== "/" ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    throw new Error("SITE_URL must be an HTTPS origin without credentials, path, query or hash");
  }

  return parsed.origin;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function normalizedLastModified(value: string): string | null {
  // Reject permissive Date.parse rollovers and local-time/non-ISO inputs.
  const match =
    /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-](\d{2}):(\d{2})))?$/.exec(
      value,
    );
  if (!match || Number(match[1]) < 1) return null;
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value.slice(0, 10))
    return null;
  if (
    (match[4] !== undefined &&
      (Number(match[4]) > 23 || Number(match[5]) > 59 || Number(match[6]) > 59)) ||
    (match[7] !== undefined && (Number(match[7]) > 23 || Number(match[8]) > 59))
  )
    return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return match[4] === undefined ? value : new Date(timestamp).toISOString();
}

export function buildSitemapXml(origin: string, content: SitemapContent): string {
  const normalizedOrigin = normalizeSiteUrl(origin);
  const entries = new Map<string, string | null>();
  function addStatic(
    basePath: (typeof BASE_STATIC_PATHS)[number],
    locale: (typeof LOCALES)[number],
  ) {
    // Route parity is the authority for public static paths, never an independent URL list.
    if (BASE_STATIC_PATHS.includes(basePath)) entries.set(localizeRawPath(basePath, locale), null);
  }

  for (const locale of LOCALES) {
    const sites = content.sites.filter((site) => (site.locale ?? "fa") === locale);
    if (sites.length === 1 && hasLocalizedSite(sites[0]!, locale)) addStatic("/", locale);
    for (const slug of SITEMAP_PAGE_SLUGS) {
      const pages = content.pages.filter((page) => page.slug === slug && page.locale === locale);
      if (pages.length === 1 && isIndexablePage(pages[0]!, locale)) addStatic(`/${slug}`, locale);
    }
    const portfolio = content.portfolioItems.filter((item) => (item.locale ?? "fa") === locale);
    if (buildPortfolioModel(portfolio).length > 0) addStatic("/portfolio", locale);
    // Ambiguous active translations are a repository error, never a sitemap URL.
    const products = content.products.filter(
      (product) => product.isActive === true && (product.locale ?? "fa") === locale,
    );
    const productCounts = new Map<string, number>();
    for (const product of products)
      productCounts.set(product.slug, (productCounts.get(product.slug) ?? 0) + 1);
    for (const product of products) {
      if (productCounts.get(product.slug) !== 1 || !isIndexableProduct(product, locale)) continue;
      addStatic("/grave-stones", locale);
      // A row timestamp does not cover variant/media/translation revisions.
      // Omit product lastmod until an aggregate public-page date is available.
      entries.set(localizeRawPath(`/grave-stones/${product.slug}`, locale), null);
    }
    const guides = content.guides.filter((guide) => guide.locale === locale);
    const guideCounts = new Map<string, number>();
    for (const guide of guides) guideCounts.set(guide.slug, (guideCounts.get(guide.slug) ?? 0) + 1);
    for (const guide of guides) {
      if (guideCounts.get(guide.slug) !== 1 || !isIndexableGuide(guide, locale)) continue;
      addStatic("/guides", locale);
      entries.set(
        localizeRawPath(`/guides/${guide.slug}`, locale),
        normalizedLastModified(guide.updatedAt),
      );
    }
  }

  const body = [...entries.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([path, lastModified]) => {
      const location = escapeXml(new URL(path, `${normalizedOrigin}/`).toString());
      if (location.length >= 2048) return "";
      const lastmod =
        lastModified === null ? "" : `\n    <lastmod>${escapeXml(lastModified)}</lastmod>`;
      return `  <url>\n    <loc>${location}</loc>${lastmod}\n  </url>`;
    })
    .filter(Boolean)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

async function loadSitemapContent(): Promise<SitemapContent> {
  const locales = await Promise.all(
    LOCALES.map(async (locale) => {
      const [products, portfolioItems, site, pages, summaries] = await Promise.all([
        loadProducts({ locale }),
        loadPortfolioItems({ locale }),
        loadSite(locale),
        Promise.all(SITEMAP_PAGE_SLUGS.map((slug) => loadGitPage(slug, locale))),
        loadGitGuides({ locale }),
      ]);
      const guides = await Promise.all(summaries.map((guide) => loadGitGuide(guide.slug, locale)));
      return {
        products,
        portfolioItems,
        // loadSite may project neutral Persian contact data for an absent EN record.
        // That projection is not a second Persian publication or an English identity.
        sites: site && hasLocalizedSite(site, locale) ? [site] : [],
        pages: pages.filter((page): page is Page => page !== null),
        guides: guides.filter((guide): guide is Guide => guide !== null),
      };
    }),
  );
  return {
    products: locales.flatMap((item) => item.products),
    portfolioItems: locales.flatMap((item) => item.portfolioItems),
    sites: locales.flatMap((item) => item.sites),
    pages: locales.flatMap((item) => item.pages),
    guides: locales.flatMap((item) => item.guides),
  };
}

const defaultDependencies: SitemapDependencies = {
  loadContent: loadSitemapContent,
};

function plainResponse(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: {
      "cache-control": "no-store, max-age=0",
      "content-type": "text/plain; charset=utf-8",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function handleSitemapRequest(
  request: Request,
  env: unknown,
  dependencies: SitemapDependencies = defaultDependencies,
): Promise<Response | null> {
  if (request.method !== "GET") return null;

  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return null;
  }
  if (url.pathname !== "/sitemap.xml") return null;

  if (envString(env, "PUBLIC_INDEXING") !== "true") {
    return plainResponse("Not Found", 404);
  }

  const rawOrigin = envString(env, "SITE_URL");
  if (rawOrigin === null) return plainResponse("Service Unavailable", 503);

  let origin: string;
  try {
    origin = normalizeSiteUrl(rawOrigin);
  } catch {
    return plainResponse("Service Unavailable", 503);
  }

  try {
    const content = await dependencies.loadContent();
    const xml = buildSitemapXml(origin, content);
    if (!xml.includes("<url>")) return plainResponse("Service Unavailable", 503);
    return new Response(xml, {
      status: 200,
      headers: {
        "cache-control": "public, max-age=300, s-maxage=3600",
        "content-type": "application/xml; charset=utf-8",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    console.error("Sitemap content load failed");
    return plainResponse("Service Unavailable", 503);
  }
}
