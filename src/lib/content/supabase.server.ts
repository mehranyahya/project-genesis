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

/**
 * Runtime structured content repository.
 *
 * It consumes only the sanitized build artifact. There is no runtime fetch,
 * Supabase URL, service-role key, private Storage path, media key or consent
 * metadata in this module or the Worker bundle.
 */
export async function loadProducts(query: ProductQuery = {}): Promise<Product[]> {
  let products = GENERATED_PRODUCTS.filter((product) => product.isActive === true);
  if (query.type) products = products.filter((product) => product.type === query.type);
  if (query.featuredOnly) products = products.filter((product) => product.isFeatured === true);
  if (query.sizeCode) {
    products = products.filter((product) =>
      product.variants.some(
        (variant) => variant.isAvailable === true && variant.sizeCode === query.sizeCode,
      ),
    );
  }
  if (query.limit != null) products = products.slice(0, query.limit);
  return products.slice();
}

export async function loadProduct(slug: string): Promise<Product | null> {
  return (
    GENERATED_PRODUCTS.find((product) => product.isActive === true && product.slug === slug) ?? null
  );
}

export async function loadPortfolioItems(query: PortfolioQuery = {}): Promise<PortfolioItem[]> {
  const items = GENERATED_PORTFOLIO_ITEMS.slice();
  return query.limit == null ? items : items.slice(0, query.limit);
}

export async function loadSite(): Promise<Site | null> {
  return GENERATED_SITE;
}

export async function loadCatalogVersion(): Promise<CatalogVersion | null> {
  return GENERATED_CATALOG_VERSION;
}
