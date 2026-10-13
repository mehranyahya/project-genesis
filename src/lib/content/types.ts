/**
 * Mehrara content types. Structure only — no fixtures, no sample data.
 */

import type { Locale } from "../i18n/locale";
import type { StoneworkCategoryId } from "../stonework-category";
import type { PublicRouteAvailability } from "../i18n/route-availability";

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
  "stoneworks",
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

/**
 * The only media shape allowed to cross the build/runtime boundary.
 * Private Storage paths, media keys, captions, consent references and privacy
 * review state never enter browser-facing content objects.
 */
export interface Media {
  src: string;
  srcSet: string;
  width: number;
  height: number;
  alt: string;
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
  /** Absent means Persian; explicit "en" marks English editorial content. */
  locale?: string | null;
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
  /** Derived by the repository from renderable, indexable same-slug counterparts. */
  translationLocales?: Locale[];
  /** Renderable counterparts, including owner-approved noindex copy. */
  readableLocales?: Locale[];
}

export interface PortfolioItem {
  locale?: string | null;
  publicReferenceId: string;
  media: Media[];
  stoneCode?: string | null;
  sizeCode?: GraveStoneSizeCode | null;
  summary?: string | null;
}

export interface Guide {
  locale?: string | null;
  slug: string;
  title: string;
  summary: string | null;
  body: string;
  seo: SeoMeta | null;
  updatedAt: string;
  /** Derived from indexable published counterparts, never assumed from route parity. */
  translationLocales?: Locale[];
  readableLocales?: Locale[];
}

/** Listing/home requests never transfer article bodies or unused SEO fields. */
export type GuideSummary = Pick<Guide, "locale" | "slug" | "title" | "summary" | "updatedAt">;

export interface SiteLinks {
  instagram: string | null;
  website: string | null;
  map: string | null;
}

export interface Site {
  locale?: string | null;
  displayName: string;
  latinName: string;
  phone: string | null;
  whatsappUrl: string | null;
  telegram: string | null;
  address: string | null;
  workingHours: string | null;
  links: SiteLinks;
}

export interface SiteRouteContent {
  readonly site: Site | null;
  readonly routeAvailability: PublicRouteAvailability;
}

export interface Page {
  locale?: string | null;
  slug: PageSlug;
  title: string;
  body: string;
  seo: SeoMeta | null;
  /** Derived from usable, indexable published pages of the same slug. */
  translationLocales?: Locale[];
  /** Owner-reviewed service categories; emitted only for the Stoneworks page. */
  stoneworkCategories?: StoneworkCategoryId[];
  /** Resolved public media only; source selectors never cross the adapter. */
  serviceMedia?: ServiceMediaItem[];
  /** Present only when the source page is explicitly versioned. */
  version?: string;
  /** SHA-256 acceptance hash; currently emitted only for the Terms page. */
  contentHash?: string;
}

export interface ServiceMediaItem {
  media: Media;
  /** A published project may refer an enquiry; a stone sample has no project ID. */
  portfolioReferenceId: string | null;
}

export type ServiceMediaReference =
  | { source: "building"; assetId: string }
  | { source: "portfolio"; assetId: string; publicReferenceId: string };

/** Build artifact shape. Selectors are resolved and stripped by getPage. */
export interface CompiledPage extends Page {
  mediaReferences?: ServiceMediaReference[];
}

export interface ProductQuery {
  locale?: Locale;
  type?: ProductType;
  featuredOnly?: boolean;
  sizeCode?: GraveStoneSizeCode;
  limit?: number;
}

export interface PortfolioQuery {
  locale?: Locale;
  limit?: number;
}

export interface GuideQuery {
  locale?: Locale;
  limit?: number;
}
