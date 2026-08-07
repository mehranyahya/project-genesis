/**
 * Mehrara content types. Structure only — no fixtures, no sample data.
 */

export type PriceType = "fixed" | "estimate" | "review";

/** Backwards-compatible alias for the price contract. */
export type PriceState = PriceType;

export type ProductType = "simple" | "cnc_box";

export type GraveStoneSizeCode = "120x60" | "160x60" | "180x60" | "custom";

export type BuildingStoneType = "marble" | "granite" | "travertine" | "crystal";

export type BuildingStoneApplication =
  "facade" | "flooring" | "stairs" | "interior_wall" | "countertop" | "other";

export const PAGE_SLUGS = [
  "home",
  "building-stone",
  "about",
  "contact",
  "privacy",
  "terms",
  "not-found",
] as const;

export type PageSlug = (typeof PAGE_SLUGS)[number];

/** Lowercase 64-character SHA-256 hex digest of the published catalog. */
export type CatalogVersion = string & { readonly __brand: "CatalogVersion" };

export const CATALOG_VERSION_PATTERN = /^[0-9a-f]{64}$/;

export function isCatalogVersion(value: string): value is CatalogVersion {
  return CATALOG_VERSION_PATTERN.test(value);
}

export interface SeoMeta {
  title: string;
  description: string | null;
  canonicalPath: string | null;
  robots: string | null;
}

export interface Media {
  mediaKey: string;
  alt: string;
  caption: string | null;
  privacyCleared: boolean;
  consentReference: string | null;
  width?: number;
  height?: number;
}

export interface ProductOption {
  id: string;
  title: string;
  priceType: PriceType;
  amountToman: number | null;
  priceUpdatedAt: string | null;
  isAvailable: boolean;
  compatibleSizeCodes: GraveStoneSizeCode[];
}

export interface ProductVariant {
  id: string;
  stoneCode: string;
  sizeCode: GraveStoneSizeCode;
  priceType: PriceType;
  amountToman: number | null;
  priceUpdatedAt: string | null;
  includes: string[];
  excludes: string[];
  options: ProductOption[];
  isAvailable: boolean;
}

export interface Product {
  id: string;
  code: string;
  slug: string;
  type: ProductType;
  title: string;
  summary: string | null;
  description: string | null;
  isActive: boolean;
  isFeatured: boolean;
  media: Media[];
  variants: ProductVariant[];
  seo: SeoMeta | null;
  updatedAt: string;
}

export interface PortfolioItem {
  publicReferenceId: string;
  media: Media[];
  stoneCode?: string | null;
  sizeCode?: GraveStoneSizeCode | null;
  summary?: string | null;
}

export interface Guide {
  slug: string;
  title: string;
  summary: string | null;
  body: string;
  seo: SeoMeta | null;
  updatedAt: string;
}

export interface SiteLinks {
  instagram: string | null;
  website: string | null;
  map: string | null;
}

export interface Site {
  displayName: string;
  latinName: string;
  phone: string | null;
  whatsapp: string | null;
  telegram: string | null;
  address: string | null;
  workingHours: string | null;
  links: SiteLinks;
}

export interface Page {
  slug: PageSlug;
  title: string;
  body: string;
  seo: SeoMeta | null;
  /** Present only when the source page is explicitly versioned. */
  version?: string;
  /** SHA-256 acceptance hash; currently emitted only for the Terms page. */
  contentHash?: string;
}

export interface ProductQuery {
  type?: ProductType;
  featuredOnly?: boolean;
  sizeCode?: GraveStoneSizeCode;
  limit?: number;
}

export interface PortfolioQuery {
  limit?: number;
}

export interface GuideQuery {
  limit?: number;
}
