import { createServerFn } from "@tanstack/react-start";
import { validateLocaleQuery } from "./locale-query";

import {
  validatePortfolioQuery,
  validateProductLookup,
  validateProductQuery,
} from "./catalog-queries";
import {
  loadCatalogVersion,
  loadPortfolioItems,
  loadProduct,
  loadProducts,
  loadSite,
} from "./supabase.server";

export const getProductsFromServer = createServerFn({ method: "GET" })
  .validator(validateProductQuery)
  .handler(({ data }) => loadProducts(data));

export const getProductFromServer = createServerFn({ method: "GET" })
  .validator(validateProductLookup)
  .handler(({ data }) => loadProduct(data.slug, data.locale));

export const getPortfolioItemsFromServer = createServerFn({ method: "GET" })
  .validator(validatePortfolioQuery)
  .handler(({ data }) => loadPortfolioItems(data));

export const getSiteFromServer = createServerFn({ method: "GET" })
  .validator(validateLocaleQuery)
  .handler(({ data }) => loadSite(data.locale));

export const getCatalogVersionFromServer = createServerFn({ method: "GET" }).handler(() =>
  loadCatalogVersion(),
);
