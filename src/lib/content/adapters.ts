/**
 * The only content surface routes may consume.
 * Operational structured content is loaded through TanStack server functions;
 * routes/components never import Supabase or server credentials directly.
 * Long-form pages are read from Git through a separate server-only boundary.
 * Guides remain intentionally blocked until their Git repository is wired.
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
import { getPageFromGitServer } from "./git.functions";
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
  return getPageFromGitServer({ data: { slug } });
}

export async function getCatalogVersion(): Promise<CatalogVersion | null> {
  return getCatalogVersionFromServer();
}
