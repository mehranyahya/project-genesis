import { DEFAULT_LOCALE, isLocale, type Locale } from "../i18n/locale";
import type {
  GraveStoneSizeCode,
  PortfolioItem,
  PortfolioQuery,
  Product,
  ProductQuery,
  ProductType,
} from "./types";

const PRODUCT_TYPES = new Set<ProductType>(["simple", "cnc_box"]);
const SIZE_CODES = new Set<GraveStoneSizeCode>(["120x60", "160x60", "180x60", "custom"]);

function inputRecord(input: unknown, message: string): Record<string, unknown> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) throw new Error(message);
  return input as Record<string, unknown>;
}

function validateLocale(value: unknown): Locale {
  if (value == null) return DEFAULT_LOCALE;
  if (!isLocale(value)) throw new Error("Invalid content locale");
  return value;
}

function validateLimit(value: unknown): number | undefined {
  if (value == null) return undefined;
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 100) {
    throw new Error("Invalid content query limit");
  }
  return Number(value);
}

export function validateProductQuery(input: unknown): ProductQuery {
  const raw = input == null ? {} : inputRecord(input, "Invalid product query");
  const query: ProductQuery = { locale: validateLocale(raw["locale"]) };
  if (raw["type"] != null) {
    if (typeof raw["type"] !== "string" || !PRODUCT_TYPES.has(raw["type"] as ProductType)) {
      throw new Error("Invalid product type");
    }
    query.type = raw["type"] as ProductType;
  }
  if (raw["featuredOnly"] != null) {
    if (typeof raw["featuredOnly"] !== "boolean") throw new Error("Invalid featuredOnly value");
    query.featuredOnly = raw["featuredOnly"];
  }
  if (raw["sizeCode"] != null) {
    if (
      typeof raw["sizeCode"] !== "string" ||
      !SIZE_CODES.has(raw["sizeCode"] as GraveStoneSizeCode)
    ) {
      throw new Error("Invalid size code");
    }
    query.sizeCode = raw["sizeCode"] as GraveStoneSizeCode;
  }
  const limit = validateLimit(raw["limit"]);
  if (limit !== undefined) query.limit = limit;
  return query;
}

export function validatePortfolioQuery(input: unknown): PortfolioQuery {
  const raw = input == null ? {} : inputRecord(input, "Invalid portfolio query");
  const query: PortfolioQuery = { locale: validateLocale(raw["locale"]) };
  const limit = validateLimit(raw["limit"]);
  if (limit !== undefined) query.limit = limit;
  return query;
}

export function validateProductLookup(input: unknown): { slug: string; locale: Locale } {
  const raw = inputRecord(input, "Invalid product lookup");
  const slug = raw["slug"];
  if (typeof slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error("Invalid product slug");
  }
  return { slug, locale: validateLocale(raw["locale"]) };
}

function belongsToLocale(item: { locale?: string | null }, locale: Locale): boolean {
  // Legacy unlabelled records remain Persian; an invalid label is never a fallback.
  return (item.locale ?? DEFAULT_LOCALE) === locale;
}

export function selectProducts(products: readonly Product[], query: ProductQuery = {}): Product[] {
  const locale = validateLocale(query.locale);
  let selected = products.filter(
    (product) => product.isActive === true && belongsToLocale(product, locale),
  );
  if (query.type) selected = selected.filter((product) => product.type === query.type);
  if (query.featuredOnly) selected = selected.filter((product) => product.isFeatured === true);
  if (query.sizeCode) {
    selected = selected.filter((product) =>
      product.variants.some(
        (variant) => variant.isAvailable === true && variant.sizeCode === query.sizeCode,
      ),
    );
  }
  const limit = validateLimit(query.limit);
  return limit === undefined ? selected : selected.slice(0, limit);
}

export function selectProduct(
  products: readonly Product[],
  slug: string,
  locale: Locale = DEFAULT_LOCALE,
): Product | null {
  const lookup = validateProductLookup({ slug, locale });
  const matches = products.filter(
    (product) =>
      product.isActive === true &&
      product.slug === lookup.slug &&
      belongsToLocale(product, lookup.locale),
  );
  if (matches.length > 1) throw new Error("Ambiguous product translation");
  return matches[0] ?? null;
}

export function selectPortfolioItems(
  items: readonly PortfolioItem[],
  query: PortfolioQuery = {},
): PortfolioItem[] {
  const locale = validateLocale(query.locale);
  const selected = items.filter((item) => belongsToLocale(item, locale));
  const limit = validateLimit(query.limit);
  return limit === undefined ? selected : selected.slice(0, limit);
}
