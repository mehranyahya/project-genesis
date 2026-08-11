/**
 * Pure, side-effect free home view-model.
 * Applies section-omission thresholds over official adapter results only.
 * No fixtures, no fallbacks, no fabricated data.
 */

import type { Guide, Media, PortfolioItem, Product } from "./content/types";

export const FEATURED_PRODUCTS_LIMIT = 6;
export const FEATURED_PRODUCTS_MIN = 3;

export interface HomeProductItem {
  readonly slug: string;
  readonly title: string;
  readonly summary: string | null;
  readonly media: Media | null;
}

export interface HomeGuideItem {
  readonly slug: string;
  readonly title: string;
  readonly summary: string | null;
}

export interface HomeViewModel {
  readonly heroMedia: Media | null;
  readonly products: readonly HomeProductItem[];
  readonly showProducts: boolean;
  readonly showPortfolio: boolean;
  readonly guide: HomeGuideItem | null;
  readonly showGuide: boolean;
}

export interface HomeAdapterResult {
  readonly products: readonly Product[];
  readonly portfolioItems: readonly PortfolioItem[];
  readonly guides: readonly Guide[];
}

function cleanText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isValidProduct(product: Product): boolean {
  return (
    product.isActive === true &&
    cleanText(product.slug) !== null &&
    cleanText(product.title) !== null
  );
}

function isValidPortfolioItem(item: PortfolioItem): boolean {
  return cleanText(item.publicReferenceId) !== null && item.media.length > 0;
}

function isValidGuide(guide: Guide): boolean {
  return cleanText(guide.slug) !== null && cleanText(guide.title) !== null;
}

export function buildHomeViewModel(input: HomeAdapterResult): HomeViewModel {
  const validProducts = input.products.filter(isValidProduct).slice(0, FEATURED_PRODUCTS_LIMIT);
  const heroMedia = validProducts.find((product) => product.media.length > 0)?.media[0] ?? null;
  const products = validProducts.map((product) => ({
    slug: product.slug,
    title: product.title,
    summary: cleanText(product.summary),
    media: product.media[0] ?? null,
  }));

  const showProducts = products.length >= FEATURED_PRODUCTS_MIN;
  const portfolioItem = input.portfolioItems.filter(isValidPortfolioItem)[0] ?? null;

  const validGuide = input.guides.filter(isValidGuide)[0] ?? null;
  const guide: HomeGuideItem | null = validGuide
    ? { slug: validGuide.slug, title: validGuide.title, summary: cleanText(validGuide.summary) }
    : null;

  return {
    heroMedia,
    products: showProducts ? products : [],
    showProducts,
    showPortfolio: portfolioItem !== null,
    guide,
    showGuide: guide !== null,
  };
}
