import {
  GENERATED_CATALOG_VERSION,
  GENERATED_PORTFOLIO_ITEMS,
  GENERATED_PRODUCTS,
  GENERATED_SITE,
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
import { DEFAULT_LOCALE, type Locale } from "../i18n/locale";

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

export async function loadSite(): Promise<Site | null> {
  return GENERATED_SITE;
}

export async function loadCatalogVersion(): Promise<CatalogVersion | null> {
  return GENERATED_CATALOG_VERSION;
}
