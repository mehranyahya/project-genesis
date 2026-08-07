/**
 * The only content surface routes may consume.
 * Operational structured content is loaded through TanStack server functions;
 * routes/components never import Supabase or server credentials directly.
 * Guides and long-form pages remain Git-versioned and intentionally blocked
 * until their repository is wired in the content integration stage.
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
import {
  getCatalogVersionFromServer,
  getPortfolioItemsFromServer,
  getProductFromServer,
  getProductsFromServer,
  getSiteFromServer,
} from "./supabase.functions";

export async function getProducts(query?: ProductQuery): Promise<Product[]> {
  return getProductsFromServer({ data: query ?? {} });
}

export async function getProduct(slug: string): Promise<Product | null> {
  return getProductFromServer({ data: { slug } });
}

export async function getPortfolioItems(query?: PortfolioQuery): Promise<PortfolioItem[]> {
  return getPortfolioItemsFromServer({ data: query ?? {} });
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
  return getSiteFromServer();
}

export async function getPage(slug: PageSlug): Promise<Page | null> {
  void slug;
  return null;
}

export async function getCatalogVersion(): Promise<CatalogVersion | null> {
  return getCatalogVersionFromServer();
}
