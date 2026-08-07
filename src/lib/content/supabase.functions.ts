import { createServerFn } from "@tanstack/react-start";

import type { PortfolioQuery, ProductQuery } from "./types";
import {
  loadCatalogVersion,
  loadPortfolioItems,
  loadProduct,
  loadProducts,
  loadSite,
} from "./supabase.server";

const PRODUCT_TYPES = new Set(["simple", "cnc_box"]);
const SIZE_CODES = new Set(["120x60", "160x60", "180x60", "custom"]);

function validateLimit(value: unknown): number | undefined {
  if (value == null) return undefined;
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 100) {
    throw new Error("Invalid content query limit");
  }
  return Number(value);
}

function validateProductQuery(input: unknown): ProductQuery {
  if (input == null) return {};
  if (typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid product query");

  const raw = input as Record<string, unknown>;
  const query: ProductQuery = {};

  if (raw.type != null) {
    if (typeof raw.type !== "string" || !PRODUCT_TYPES.has(raw.type)) {
      throw new Error("Invalid product type");
    }
    query.type = raw.type as ProductQuery["type"];
  }

  if (raw.featuredOnly != null) {
    if (typeof raw.featuredOnly !== "boolean") throw new Error("Invalid featuredOnly value");
    query.featuredOnly = raw.featuredOnly;
  }

  if (raw.sizeCode != null) {
    if (typeof raw.sizeCode !== "string" || !SIZE_CODES.has(raw.sizeCode)) {
      throw new Error("Invalid size code");
    }
    query.sizeCode = raw.sizeCode as ProductQuery["sizeCode"];
  }

  const limit = validateLimit(raw.limit);
  if (limit != null) query.limit = limit;
  return query;
}

function validatePortfolioQuery(input: unknown): PortfolioQuery {
  if (input == null) return {};
  if (typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid portfolio query");
  const raw = input as Record<string, unknown>;
  const query: PortfolioQuery = {};
  const limit = validateLimit(raw.limit);
  if (limit != null) query.limit = limit;
  return query;
}

function validateSlug(input: unknown): { slug: string } {
  if (typeof input !== "object" || input == null || Array.isArray(input)) {
    throw new Error("Invalid product lookup");
  }
  const slug = (input as Record<string, unknown>).slug;
  if (typeof slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error("Invalid product slug");
  }
  return { slug };
}

export const getProductsFromServer = createServerFn({ method: "GET" })
  .validator(validateProductQuery)
  .handler(({ data }) => loadProducts(data));

export const getProductFromServer = createServerFn({ method: "GET" })
  .validator(validateSlug)
  .handler(({ data }) => loadProduct(data.slug));

export const getPortfolioItemsFromServer = createServerFn({ method: "GET" })
  .validator(validatePortfolioQuery)
  .handler(({ data }) => loadPortfolioItems(data));

export const getSiteFromServer = createServerFn({ method: "GET" }).handler(() => loadSite());

export const getCatalogVersionFromServer = createServerFn({ method: "GET" }).handler(() =>
  loadCatalogVersion(),
);
