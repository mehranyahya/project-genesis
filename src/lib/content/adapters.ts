/**
 * The only content surface routes may consume.
 * Operational structured content is loaded through TanStack server functions;
 * routes/components never import Supabase or server credentials directly.
 * Long-form pages are read from Git through a separate server-only boundary.
 * Guides use reviewed Git artifacts through that same server-only boundary.
 */

import type {
  CatalogVersion,
  Guide,
  GuideSummary,
  GuideQuery,
  Page,
  PageSlug,
  PortfolioItem,
  PortfolioQuery,
  Product,
  ProductQuery,
  Site,
  SiteRouteContent,
} from "./types";
import {
  getPageFromGitServer,
  getGuideFromGitServer,
  getGuidesFromGitServer,
} from "./git.functions";
import {
  getCatalogVersionFromServer,
  getPortfolioItemsFromServer,
  getProductFromServer,
  getProductsFromServer,
  getSiteFromServer,
} from "./supabase.functions";
import { DEFAULT_LOCALE, type Locale } from "../i18n/locale";

export async function getProducts(query?: ProductQuery): Promise<Product[]> {
  return getProductsFromServer({ data: query ?? {} });
}

export async function getProduct(
  slug: string,
  locale: Locale = DEFAULT_LOCALE,
): Promise<Product | null> {
  return getProductFromServer({ data: { slug, locale } });
}

export async function getPortfolioItems(query?: PortfolioQuery): Promise<PortfolioItem[]> {
  return getPortfolioItemsFromServer({ data: query ?? {} });
}

export async function getGuides(query?: GuideQuery): Promise<GuideSummary[]> {
  return getGuidesFromGitServer({ data: query ?? {} });
}

export async function getGuide(
  slug: string,
  locale: Locale = DEFAULT_LOCALE,
): Promise<Guide | null> {
  return getGuideFromGitServer({ data: { slug, locale } });
}

export function getSite(
  locale: Locale,
  options: { includeRouteAvailability: true },
): Promise<SiteRouteContent>;
export function getSite(locale?: Locale): Promise<Site | null>;
export async function getSite(
  locale: Locale = DEFAULT_LOCALE,
  options?: { includeRouteAvailability: true },
): Promise<Site | SiteRouteContent | null> {
  const result = await getSiteFromServer({
    data: {
      locale,
      ...(options?.includeRouteAvailability ? { includeRouteAvailability: true } : {}),
    },
  });
  const wrapped = result !== null && "site" in result;
  if (!!options?.includeRouteAvailability !== wrapped)
    throw new Error("Invalid site content response");
  return result;
}

export async function getPage(
  slug: PageSlug,
  locale: Locale = DEFAULT_LOCALE,
  options?: { signal?: AbortSignal },
): Promise<Page | null> {
  return getPageFromGitServer({ data: { slug, locale }, ...options });
}

export async function getCatalogVersion(): Promise<CatalogVersion | null> {
  return getCatalogVersionFromServer();
}
