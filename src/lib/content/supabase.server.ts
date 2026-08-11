import type {
  CatalogVersion,
  PortfolioItem,
  PortfolioQuery,
  Product,
  ProductQuery,
  Site,
} from "./types";
import { GENERATED_CATALOG } from "../../data/catalog/catalog.generated";
import { isCatalogVersion } from "./types";

/**
 * Structured content is compiled into a public, browser-safe artifact before
 * Vite runs. Supabase credentials and private media identifiers are consumed
 * only by the trusted build job and never exist in this runtime module.
 */
export async function loadProducts(query: ProductQuery = {}): Promise<Product[]> {
  let products = GENERATED_CATALOG.products.filter((product) => product.isActive === true);

  if (query.type !== undefined) {
    products = products.filter((product) => product.type === query.type);
  }
  if (query.featuredOnly === true) {
    products = products.filter((product) => product.isFeatured === true);
  }
  if (query.sizeCode !== undefined) {
    products = products.filter((product) =>
      product.variants.some(
        (variant) => variant.isAvailable === true && variant.sizeCode === query.sizeCode,
      ),
    );
  }

  return query.limit === undefined ? [...products] : products.slice(0, query.limit);
}

export async function loadProduct(slug: string): Promise<Product | null> {
  return (
    GENERATED_CATALOG.products.find(
      (product) => product.isActive === true && product.slug === slug,
    ) ?? null
  );
}

export async function loadPortfolioItems(query: PortfolioQuery = {}): Promise<PortfolioItem[]> {
  const items = GENERATED_CATALOG.portfolioItems;
  return query.limit === undefined ? [...items] : items.slice(0, query.limit);
}

export async function loadSite(): Promise<Site | null> {
  return GENERATED_CATALOG.site;
}

export async function loadCatalogVersion(): Promise<CatalogVersion | null> {
  const version = GENERATED_CATALOG.catalogVersion;
  return typeof version === "string" && isCatalogVersion(version) ? version : null;
}
