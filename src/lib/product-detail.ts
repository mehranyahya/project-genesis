/**
 * Pure, side-effect free product-detail view-model.
 * Consumes official adapter output only. No fixtures, no fallbacks, no
 * fabricated products, prices, dates or media. Inputs are never mutated.
 */

import type {
  GraveStoneSizeCode,
  PriceType,
  Product,
  ProductType,
  ProductVariant,
  Media,
} from "./content/types";
import { isPublicMedia } from "./content/media";
import { GRAVE_STONE_SIZE_ORDER } from "./grave-stone-list";

/** Locked M5 size order, imported read-only from the Prompt 04 contract. */
export const PRODUCT_SIZE_ORDER = GRAVE_STONE_SIZE_ORDER;

const SIZE_INDEX = new Map<string, number>(PRODUCT_SIZE_ORDER.map((code, index) => [code, index]));

export const SIZE_LABELS: Readonly<Record<GraveStoneSizeCode, string>> = {
  "120x60": "۱۲۰×۶۰",
  "160x60": "۱۶۰×۶۰",
  "180x60": "۱۸۰×۶۰",
  custom: "سفارشی",
};

export const PRODUCT_TYPE_LABELS: Readonly<Record<ProductType, string>> = {
  simple: "سنگ مزار ساده",
  cnc_box: "اجرای CNC",
};

export const PRICE_TYPE_LABELS: Readonly<Record<PriceType, string>> = {
  fixed: "قیمت",
  estimate: "برآورد",
  review: "نیازمند بررسی",
};

export const CURRENCY_NOTE = "همهٔ مبالغ به تومان است.";
export const PRICE_DATE_LABEL = "آخرین به‌روزرسانی قیمت:";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const amountFormatter = new Intl.NumberFormat("fa-IR");
const dateFormatter = new Intl.DateTimeFormat("fa-IR", { dateStyle: "long", timeZone: "UTC" });

export type ProductDetailMedia = Media;

export interface ProductDetailOption {
  readonly id: string;
  readonly title: string;
  readonly priceType: PriceType;
  readonly amountToman: number | null;
  readonly priceUpdatedAt: string | null;
}

export interface ProductDetailVariant {
  readonly id: string;
  readonly stoneCode: string;
  readonly sizeCode: GraveStoneSizeCode;
  readonly sizeLabel: string;
  readonly priceType: PriceType;
  readonly amountToman: number | null;
  readonly priceUpdatedAt: string | null;
  readonly includes: readonly string[];
  readonly excludes: readonly string[];
  readonly options: readonly ProductDetailOption[];
}

export interface ProductDetailModel {
  readonly id: string;
  readonly code: string;
  readonly slug: string;
  readonly type: ProductType;
  readonly typeLabel: string;
  readonly title: string;
  readonly summary: string | null;
  readonly description: string | null;
  readonly media: readonly ProductDetailMedia[];
  readonly variants: readonly ProductDetailVariant[];
}

export interface SelectionPrice {
  readonly priceType: PriceType;
  readonly amountToman: number | null;
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function cleanList(values: readonly string[] | null | undefined): readonly string[] {
  const out: string[] = [];
  for (const value of values ?? []) {
    const text = cleanText(value);
    if (text !== null) out.push(text);
  }
  return out;
}

function isSizeCode(value: unknown): value is GraveStoneSizeCode {
  return typeof value === "string" && SIZE_INDEX.has(value);
}

export function isValidAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/** Only an exact YYYY-MM-DD calendar date is accepted as a price date. */
export function normalizePriceDate(value: unknown): string | null {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(time)) return null;
  return new Date(time).toISOString().slice(0, 10) === value ? value : null;
}

export function formatAmount(amount: number): string {
  return amountFormatter.format(amount);
}

export function formatPriceDate(value: string | null): string | null {
  const normalized = normalizePriceDate(value);
  if (normalized === null) return null;
  return dateFormatter.format(new Date(`${normalized}T00:00:00Z`));
}

/** Display-only price string. Review never renders an amount. */
export function formatPriceLabel(price: SelectionPrice): string {
  if (price.priceType === "review" || !isValidAmount(price.amountToman)) {
    return PRICE_TYPE_LABELS.review;
  }
  const amount = `${formatAmount(price.amountToman)} تومان`;
  return price.priceType === "estimate" ? `برآورد: ${amount}` : amount;
}

function normalizeOptions(
  variant: ProductVariant,
  sizeCode: GraveStoneSizeCode,
): readonly ProductDetailOption[] {
  const out: ProductDetailOption[] = [];
  const seen = new Set<string>();

  for (const option of variant.options ?? []) {
    if (option?.isAvailable !== true) continue;
    const id = cleanText(option.id);
    const title = cleanText(option.title);
    if (id === null || title === null) continue;
    if (seen.has(id)) continue;
    if (!(option.compatibleSizeCodes ?? []).includes(sizeCode)) continue;

    seen.add(id);
    out.push({
      id,
      title,
      priceType: option.priceType,
      amountToman: isValidAmount(option.amountToman) ? option.amountToman : null,
      priceUpdatedAt: normalizePriceDate(option.priceUpdatedAt),
    });
  }

  return out;
}

function normalizeVariants(product: Product): readonly ProductDetailVariant[] {
  const accepted: ProductDetailVariant[] = [];
  const seen = new Set<string>();

  for (const variant of product.variants ?? []) {
    if (variant?.isAvailable !== true) continue;
    const id = cleanText(variant.id);
    const stoneCode = cleanText(variant.stoneCode);
    if (id === null || stoneCode === null) continue;
    if (!isSizeCode(variant.sizeCode)) continue;
    if (seen.has(id)) continue;

    const sizeCode = variant.sizeCode;
    seen.add(id);
    accepted.push({
      id,
      stoneCode,
      sizeCode,
      sizeLabel: SIZE_LABELS[sizeCode],
      priceType: variant.priceType,
      amountToman: isValidAmount(variant.amountToman) ? variant.amountToman : null,
      priceUpdatedAt: normalizePriceDate(variant.priceUpdatedAt),
      includes: cleanList(variant.includes),
      excludes: cleanList(variant.excludes),
      options: normalizeOptions(variant, sizeCode),
    });
  }

  // Stable sort: locked size order, adapter order preserved inside each size.
  return accepted
    .map((variant, index) => ({ variant, index }))
    .sort((a, b) => {
      const sizeDelta =
        (SIZE_INDEX.get(a.variant.sizeCode) ?? 0) - (SIZE_INDEX.get(b.variant.sizeCode) ?? 0);
      return sizeDelta !== 0 ? sizeDelta : a.index - b.index;
    })
    .map((entry) => entry.variant);
}

function normalizeMedia(product: Product): readonly ProductDetailMedia[] {
  return (product.media ?? []).filter((media) => isPublicMedia(media));
}

export function buildProductDetailModel(
  product: Product | null | undefined,
  slugParam: string,
): ProductDetailModel | null {
  if (!product || product.isActive !== true) return null;

  const id = cleanText(product.id);
  const code = cleanText(product.code);
  const slug = cleanText(product.slug);
  const title = cleanText(product.title);
  const routeSlug = cleanText(slugParam);
  if (id === null || code === null || slug === null || title === null) return null;
  if (routeSlug === null || slug !== routeSlug) return null;

  const variants = normalizeVariants(product);
  if (variants.length === 0) return null;

  return {
    id,
    code,
    slug,
    type: product.type,
    typeLabel: PRODUCT_TYPE_LABELS[product.type],
    title,
    summary: cleanText(product.summary),
    description: cleanText(product.description),
    media: normalizeMedia(product),
    variants,
  };
}

/**
 * A single numeric price component (variant or option). Fixed/estimate amounts
 * are only valid when both a positive safe-integer amount and an exact
 * YYYY-MM-DD price date are present. Dates are never fabricated or borrowed.
 */
export interface PriceComponent {
  readonly priceType: PriceType;
  readonly amountToman: number | null;
  readonly priceUpdatedAt: string | null;
}

export function hasValidNumericPrice(component: PriceComponent): boolean {
  if (component.priceType === "review") return false;
  return (
    isValidAmount(component.amountToman) && normalizePriceDate(component.priceUpdatedAt) !== null
  );
}

/**
 * Display-only price resolution. Precedence is review > estimate > fixed.
 * The server remains the sole authority for the final amount.
 */
export function resolveSelectionPrice(
  variant: ProductDetailVariant,
  selectedOptions: readonly ProductDetailOption[],
): SelectionPrice {
  const review: SelectionPrice = { priceType: "review", amountToman: null };

  if (variant.sizeCode === "custom") return review;
  if (!hasValidNumericPrice(variant)) return review;

  let total = variant.amountToman as number;
  let hasEstimate = variant.priceType === "estimate";

  for (const option of selectedOptions) {
    if (!hasValidNumericPrice(option)) return review;
    if (option.priceType === "estimate") hasEstimate = true;
    total += option.amountToman as number;
  }

  if (!Number.isSafeInteger(total)) return review;
  return { priceType: hasEstimate ? "estimate" : "fixed", amountToman: total };
}

export function findVariant(
  model: ProductDetailModel,
  variantId: string,
): ProductDetailVariant | null {
  return model.variants.find((variant) => variant.id === variantId) ?? null;
}
