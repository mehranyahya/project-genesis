/**
 * Pure, side-effect free grave-stone list view-model.
 * Consumes official adapter output only. No fixtures, no fallbacks, no sorting,
 * no fabricated product data.
 */

import type { GraveStoneSizeCode, Product, ProductType } from "./content/types";

export const GRAVE_STONE_SIZE_ORDER = ["120x60", "160x60", "180x60", "custom"] as const;

const SIZE_SET = new Set<string>(GRAVE_STONE_SIZE_ORDER);

export const NEUTRAL_FILTER_VALUE = "all";

export type GraveStoneTypeFilter = "all" | ProductType;
export type GraveStoneSizeFilter = "all" | GraveStoneSizeCode;
export type GraveStoneStoneFilter = string;

export interface GraveStoneFilters {
  readonly type: GraveStoneTypeFilter;
  readonly stoneCode: GraveStoneStoneFilter;
  readonly sizeCode: GraveStoneSizeFilter;
}

export const NEUTRAL_GRAVE_STONE_FILTERS: GraveStoneFilters = {
  type: NEUTRAL_FILTER_VALUE,
  stoneCode: NEUTRAL_FILTER_VALUE,
  sizeCode: NEUTRAL_FILTER_VALUE,
};

export interface GraveStoneListItem {
  readonly slug: string;
  readonly title: string;
  readonly summary: string | null;
  readonly type: ProductType;
  readonly stoneCodes: readonly string[];
  readonly sizeCodes: readonly GraveStoneSizeCode[];
  /** Available variant pairs, used for same-variant stone+size matching. */
  readonly variantPairs: readonly { readonly stoneCode: string; readonly sizeCode: GraveStoneSizeCode }[];
}

export interface GraveStoneListModel {
  readonly items: readonly GraveStoneListItem[];
  readonly stoneCodes: readonly string[];
}

function cleanText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isSizeCode(value: string): value is GraveStoneSizeCode {
  return SIZE_SET.has(value);
}

export function buildGraveStoneListModel(
  products: readonly Product[] | null | undefined,
): GraveStoneListModel {
  const items: GraveStoneListItem[] = [];
  const catalogStoneCodes: string[] = [];

  for (const product of products ?? []) {
    if (product.isActive !== true) continue;
    const slug = cleanText(product.slug);
    const title = cleanText(product.title);
    if (slug === null || title === null) continue;

    const available = (product.variants ?? []).filter((variant) => variant.isAvailable === true);
    if (available.length === 0) continue;

    const stoneCodes: string[] = [];
    const sizeSeen = new Set<GraveStoneSizeCode>();
    const variantPairs: { stoneCode: string; sizeCode: GraveStoneSizeCode }[] = [];

    for (const variant of available) {
      const stoneCode = cleanText(variant.stoneCode);
      const rawSize = typeof variant.sizeCode === "string" ? variant.sizeCode : "";
      const sizeCode = isSizeCode(rawSize) ? rawSize : null;

      if (stoneCode !== null && !stoneCodes.includes(stoneCode)) stoneCodes.push(stoneCode);
      if (stoneCode !== null && !catalogStoneCodes.includes(stoneCode)) {
        catalogStoneCodes.push(stoneCode);
      }
      if (sizeCode !== null) sizeSeen.add(sizeCode);
      if (stoneCode !== null && sizeCode !== null) variantPairs.push({ stoneCode, sizeCode });
    }

    items.push({
      slug,
      title,
      summary: cleanText(product.summary),
      type: product.type,
      stoneCodes,
      sizeCodes: GRAVE_STONE_SIZE_ORDER.filter((code) => sizeSeen.has(code)),
      variantPairs,
    });
  }

  return { items, stoneCodes: catalogStoneCodes };
}

export function hasActiveGraveStoneFilters(filters: GraveStoneFilters): boolean {
  return (
    filters.type !== NEUTRAL_FILTER_VALUE ||
    filters.stoneCode !== NEUTRAL_FILTER_VALUE ||
    filters.sizeCode !== NEUTRAL_FILTER_VALUE
  );
}

function matchesVariants(item: GraveStoneListItem, filters: GraveStoneFilters): boolean {
  const stoneSelected = filters.stoneCode !== NEUTRAL_FILTER_VALUE;
  const sizeSelected = filters.sizeCode !== NEUTRAL_FILTER_VALUE;

  if (stoneSelected && sizeSelected) {
    return item.variantPairs.some(
      (pair) => pair.stoneCode === filters.stoneCode && pair.sizeCode === filters.sizeCode,
    );
  }
  if (stoneSelected) return item.stoneCodes.includes(filters.stoneCode);
  if (sizeSelected) return item.sizeCodes.includes(filters.sizeCode as GraveStoneSizeCode);
  return true;
}

export function filterGraveStoneItems(
  items: readonly GraveStoneListItem[],
  filters: GraveStoneFilters,
): readonly GraveStoneListItem[] {
  return items.filter((item) => {
    if (filters.type !== NEUTRAL_FILTER_VALUE && item.type !== filters.type) return false;
    return matchesVariants(item, filters);
  });
}
