import { loadProducts } from "./content/supabase.server";
import { BASE_STATIC_PATHS, LOCALES, localizeRawPath } from "./i18n/locale";

/**
 * Every static public route exists in both locales. Derive the sitemap from
 * the locale routing contract so new routes cannot silently disappear from SEO.
 */
export const FIXED_SITEMAP_PATHS: readonly string[] = Object.freeze(
  BASE_STATIC_PATHS.flatMap((path) =>
    LOCALES.map((locale) => localizeRawPath(path, locale)),
  ),
);

export type SitemapProduct = {
  readonly slug: string;
  readonly updatedAt: string;
  readonly isActive: boolean;
};

type SitemapDependencies = {
  readonly loadProducts: () => Promise<readonly SitemapProduct[]>;
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
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export function buildSitemapXml(origin: string, products: readonly SitemapProduct[]): string {
  const normalizedOrigin = normalizeSiteUrl(origin);
  const entries = new Map<string, string | null>();

  for (const path of FIXED_SITEMAP_PATHS) entries.set(path, null);

  for (const product of products) {
    if (!product.isActive || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(product.slug)) continue;
    const productPath = `/grave-stones/${encodeURIComponent(product.slug)}`;
    for (const locale of LOCALES) {
      entries.set(
        localizeRawPath(productPath, locale),
        normalizedLastModified(product.updatedAt),
      );
    }
  }

  const body = [...entries.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, lastModified]) => {
      const location = escapeXml(new URL(path, `${normalizedOrigin}/`).toString());
      const lastmod =
        lastModified === null ? "" : `\n    <lastmod>${escapeXml(lastModified)}</lastmod>`;
      return `  <url>\n    <loc>${location}</loc>${lastmod}\n  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

async function loadSitemapProducts(): Promise<readonly SitemapProduct[]> {
  const products = await loadProducts();
  return products.map((product) => ({
    slug: product.slug,
    updatedAt: product.updatedAt,
    isActive: product.isActive,
  }));
}

const defaultDependencies: SitemapDependencies = {
  loadProducts: loadSitemapProducts,
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
    const products = await dependencies.loadProducts();
    return new Response(buildSitemapXml(origin, products), {
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
