/**
 * PII-free grave-stone request draft contract.
 * The draft carries identifiers plus a derived display snapshot only. It never
 * carries personal data, terms, tracking codes, media keys, slugs or URLs, and
 * it is never persisted to storage, cookies, the URL or the network.
 */

import type { GraveStoneSizeCode, PriceType } from "./content/types";
import { isCatalogVersion } from "./content/types";
import type { ProductDetailModel, ProductDetailOption } from "./product-detail";
import { findVariant, formatPriceLabel, resolveSelectionPrice } from "./product-detail";

export interface GraveStoneDraftSnapshot {
  readonly productTitle: string;
  readonly productTypeLabel: string;
  readonly stoneCode: string;
  readonly sizeLabel: string;
  readonly optionTitles: readonly string[];
  readonly priceType: PriceType;
  readonly amountToman: number | null;
  readonly priceLabel: string;
  readonly priceUpdatedAt: string | null;
  readonly includes: readonly string[];
  readonly excludes: readonly string[];
}

export interface GraveStoneRequestDraft {
  readonly requestType: "grave_stone";
  readonly catalogVersion: string;
  readonly productId: string;
  readonly productCode: string;
  readonly variantId: string;
  readonly stoneCode: string;
  readonly sizeCode: GraveStoneSizeCode;
  readonly optionIds: readonly string[];
  readonly displaySnapshot: GraveStoneDraftSnapshot;
}

export const DRAFT_KEYS = [
  "requestType",
  "catalogVersion",
  "productId",
  "productCode",
  "variantId",
  "stoneCode",
  "sizeCode",
  "optionIds",
  "displaySnapshot",
] as const;

export function buildGraveStoneRequestDraft(input: {
  readonly model: ProductDetailModel;
  readonly catalogVersion: string | null | undefined;
  readonly variantId: string;
  readonly optionIds: readonly string[];
}): GraveStoneRequestDraft | null {
  const { model, catalogVersion, variantId, optionIds } = input;

  if (typeof catalogVersion !== "string" || !isCatalogVersion(catalogVersion)) return null;

  const variant = findVariant(model, variantId);
  if (variant === null) return null;

  const requested = new Set<string>();
  for (const id of optionIds) {
    if (requested.has(id)) return null;
    if (!variant.options.some((option) => option.id === id)) return null;
    requested.add(id);
  }

  // Adapter order, not selection order.
  const selected: ProductDetailOption[] = variant.options.filter((option) =>
    requested.has(option.id),
  );

  const price = resolveSelectionPrice(variant, selected);

  return {
    requestType: "grave_stone",
    catalogVersion,
    productId: model.id,
    productCode: model.code,
    variantId: variant.id,
    stoneCode: variant.stoneCode,
    sizeCode: variant.sizeCode,
    optionIds: selected.map((option) => option.id),
    displaySnapshot: {
      productTitle: model.title,
      productTypeLabel: model.typeLabel,
      stoneCode: variant.stoneCode,
      sizeLabel: variant.sizeLabel,
      optionTitles: selected.map((option) => option.title),
      priceType: price.priceType,
      amountToman: price.amountToman,
      priceLabel: formatPriceLabel(price),
      priceUpdatedAt: price.priceType === "review" ? null : variant.priceUpdatedAt,
      includes: [...variant.includes],
      excludes: [...variant.excludes],
    },
  };
}
