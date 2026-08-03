/**
 * The only content surface routes may consume.
 * Default implementations are intentionally empty: no sample data, no fabricated
 * prices, contacts, media or copy ever enter runtime. Absent data is modelled
 * as [] / null so sections can be omitted entirely.
 */

import type {
  CatalogVersion,
  Guide,
  GuideSummary,
  Page,
  PortfolioItem,
  Product,
  ProductSummary,
  Site,
} from "./types";

export async function getProducts(): Promise<ProductSummary[]> {
  return [];
}

export async function getProduct(slug: string): Promise<Product | null> {
  void slug;
  return null;
}

export async function getPortfolioItems(): Promise<PortfolioItem[]> {
  return [];
}

export async function getGuides(): Promise<GuideSummary[]> {
  return [];
}

export async function getGuide(slug: string): Promise<Guide | null> {
  void slug;
  return null;
}

export async function getSite(): Promise<Site | null> {
  return null;
}

export async function getPage(slug: string): Promise<Page | null> {
  void slug;
  return null;
}

export async function getCatalogVersion(): Promise<CatalogVersion | null> {
  return null;
}
