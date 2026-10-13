import type { Page } from "./content/types";
import { buildStaticPageModel, type StaticPageModel } from "./static-pages";
import { STONEWORK_CATEGORIES, type StoneworkCategory } from "./stoneworks";
import { normalizeStoneworkCategory } from "./stonework-category";

export interface StoneworksPageModel extends StaticPageModel {
  categories: readonly StoneworkCategory[];
}

/** Missing approval never means that all production categories are offered. */
export function buildStoneworksPageModel(
  page: Page | null | undefined,
): StoneworksPageModel | null {
  const model = buildStaticPageModel(page, "stoneworks");
  const ids = page?.stoneworkCategories;
  if (
    !model ||
    model.blocks.length === 0 ||
    !Array.isArray(ids) ||
    ids.length > STONEWORK_CATEGORIES.length ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => normalizeStoneworkCategory(id) === null)
  )
    return null;
  return {
    ...model,
    categories: ids.map((id) => ({
      ...STONEWORK_CATEGORIES.find((category) => category.id === id)!,
    })),
  };
}
