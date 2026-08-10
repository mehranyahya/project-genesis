import type {
  CatalogVersion,
  PortfolioItem,
  PortfolioQuery,
  Product,
  ProductQuery,
  Site,
} from "./types";

/**
 * CONTENT_LATER_SCAFFOLD boundary.
 *
 * Structured public content does not yet have an audited build artifact or a
 * narrow read-only Edge contract. The Cloudflare Worker must never receive a
 * Supabase service-role credential merely to make empty scaffold routes look
 * integrated. Empty arrays and null are the only authoritative values until
 * that separate content pipeline is completed.
 */
export async function loadProducts(query: ProductQuery = {}): Promise<Product[]> {
  void query;
  return [];
}

export async function loadProduct(slug: string): Promise<Product | null> {
  void slug;
  return null;
}

export async function loadPortfolioItems(query: PortfolioQuery = {}): Promise<PortfolioItem[]> {
  void query;
  return [];
}

export async function loadSite(): Promise<Site | null> {
  return null;
}

export async function loadCatalogVersion(): Promise<CatalogVersion | null> {
  return null;
}
