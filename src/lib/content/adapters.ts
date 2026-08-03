/**
 * The only content surface routes may consume.
 * Default implementations are intentionally empty: no sample data, no fabricated
 * prices, contacts, media or copy ever enter runtime. Absent data is modelled
 * as [] / null so sections can be omitted entirely.
 */

import type {
  CatalogVersion,
  Guide,
  GuideQuery,
  Page,
  PageSlug,
  PortfolioItem,
  PortfolioQuery,
  Product,
  ProductQuery,
  Site,
} from "./types";

export async function getProducts(query?: ProductQuery): Promise<Product[]> {
  void query;
  return [];
}

export async function getProduct(slug: string): Promise<Product | null> {
  void slug;
  return null;
}

export async function getPortfolioItems(query?: PortfolioQuery): Promise<PortfolioItem[]> {
  void query;
  return [];
}

export async function getGuides(query?: GuideQuery): Promise<Guide[]> {
  void query;
  return [];
}

export async function getGuide(slug: string): Promise<Guide | null> {
  void slug;
  return null;
}

export async function getSite(): Promise<Site | null> {
  return null;
}

export async function getPage(slug: PageSlug): Promise<Page | null> {
  void slug;
  return null;
}

export async function getCatalogVersion(): Promise<CatalogVersion | null> {
  return null;
}
