/**
 * Mehrara content types. Structure only — no fixtures, no sample data.
 */

export type PriceState = "fixed" | "estimate" | "review";

export type GraveStoneSize = "120x60" | "160x60" | "180x60" | "custom";

export type BuildingStoneType = "marble" | "granite" | "travertine" | "crystal";

export type BuildingStoneApplication =
  | "facade"
  | "flooring"
  | "stairs"
  | "interior_wall"
  | "countertop"
  | "other";

export interface MediaAsset {
  key: string;
  alt: string;
  width?: number;
  height?: number;
}

export interface ProductOption {
  id: string;
  label: string;
  priceState: PriceState;
  amount: number | null;
  available: boolean;
}

export interface ProductOptionGroup {
  id: string;
  label: string;
  options: ProductOption[];
}

export interface ProductSummary {
  slug: string;
  title: string;
  size: GraveStoneSize;
  priceState: PriceState;
  amount: number | null;
  media: MediaAsset | null;
}

export interface Product extends ProductSummary {
  description: string | null;
  gallery: MediaAsset[];
  optionGroups: ProductOptionGroup[];
}

export interface PortfolioItem {
  publicReferenceId: string;
  caption: string | null;
  media: MediaAsset | null;
}

export interface GuideSummary {
  slug: string;
  title: string;
  summary: string | null;
}

export interface Guide extends GuideSummary {
  body: string;
}

export interface SiteContact {
  phone: string | null;
  address: string | null;
}

export interface Site {
  title: string;
  contact: SiteContact;
}

export interface Page {
  slug: string;
  title: string;
  body: string;
}

export type CatalogVersion = string;
