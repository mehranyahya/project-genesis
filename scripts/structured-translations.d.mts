import type { Media, Product, PortfolioItem, Site } from "../src/lib/content/types";
export interface StructuredSource {
  readonly products: readonly Product[];
  readonly portfolio: readonly PortfolioItem[];
  readonly buildingMedia?: readonly Media[];
  readonly site: Site | null;
  readonly catalogVersion?: string | null;
}
export const MAX_TRANSLATION_BYTES: number;
export function translationSourceHash(
  kind: "product" | "portfolio" | "site" | "buildingMedia",
  source: Product | PortfolioItem | Site | Media,
): string;
export function applyStructuredTranslations(
  base: StructuredSource,
  translation: unknown,
): StructuredSource & {
  sites: { fa: Site | null; en: Site | null };
  buildingMediaByLocale: { fa: readonly Media[]; en: readonly Media[] };
};
export function translationAuthoringSource(base: StructuredSource): Record<string, unknown>;
export function parseTranslationJson(raw: string): unknown;
export function readStructuredTranslations(url: URL): Promise<unknown | null>;
