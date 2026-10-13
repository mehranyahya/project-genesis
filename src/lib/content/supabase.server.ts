import {
  GENERATED_CATALOG_VERSION,
  GENERATED_PORTFOLIO_ITEMS,
  GENERATED_PRODUCTS,
  GENERATED_SITES,
} from "./generated-structured-content";
import type {
  CatalogVersion,
  PortfolioItem,
  PortfolioQuery,
  Product,
  ProductQuery,
  Site,
} from "./types";
import { selectPortfolioItems, selectProduct, selectProducts } from "./catalog-queries";
import { DEFAULT_LOCALE, isLocale, type Locale } from "../i18n/locale";
import { siteForLocale } from "../i18n/content-gate";

/**
 * Runtime structured content repository.
 *
 * It consumes only the sanitized build artifact. There is no runtime fetch,
 * Supabase URL, service-role key, private Storage path, media key or consent
 * metadata in this module or the Worker bundle.
 */
export async function loadProducts(query: ProductQuery = {}): Promise<Product[]> {
  return selectProducts(GENERATED_PRODUCTS, query);
}

export async function loadProduct(
  slug: string,
  locale: Locale = DEFAULT_LOCALE,
): Promise<Product | null> {
  return selectProduct(GENERATED_PRODUCTS, slug, locale);
}

export async function loadPortfolioItems(query: PortfolioQuery = {}): Promise<PortfolioItem[]> {
  return selectPortfolioItems(GENERATED_PORTFOLIO_ITEMS, query);
}

export async function loadSite(locale: Locale = DEFAULT_LOCALE): Promise<Site | null> {
  if (!isLocale(locale)) return null;
  const selected = GENERATED_SITES[locale];
  if (selected && (selected.locale ?? DEFAULT_LOCALE) === locale)
    return { ...selected, links: { ...selected.links } };
  if (locale === DEFAULT_LOCALE) return null;
  // Preserve only the existing neutral contact/Latin-name projection when prose is absent.
  const base = GENERATED_SITES.fa;
  const neutral =
    base && (base.locale ?? DEFAULT_LOCALE) === DEFAULT_LOCALE ? siteForLocale(base, locale) : null;
  return neutral ? { ...neutral, links: { ...neutral.links } } : null;
}

export async function loadCatalogVersion(): Promise<CatalogVersion | null> {
  return GENERATED_CATALOG_VERSION;
}
