/** Public production-category IDs; free text is never a route parameter. */
export const STONEWORK_CATEGORY_IDS = [
  "sculpture_art",
  "water_landscape",
  "architectural_elements",
  "furniture_interiors",
  "monuments_bespoke",
] as const;
export type StoneworkCategoryId = (typeof STONEWORK_CATEGORY_IDS)[number];

export function normalizeStoneworkCategory(value: unknown): StoneworkCategoryId | null {
  if (typeof value !== "string") return null;
  return (STONEWORK_CATEGORY_IDS as readonly string[]).includes(value)
    ? (value as StoneworkCategoryId)
    : null;
}
