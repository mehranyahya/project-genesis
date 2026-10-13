import type { Product, PortfolioItem, Site } from "../src/lib/content/types";
export interface StructuredSource {
  readonly products: readonly Product[];
  readonly portfolio: readonly PortfolioItem[];
  readonly site: Site | null;
  readonly catalogVersion?: string | null;
}
export const MAX_TRANSLATION_BYTES: number;
export function translationSourceHash(
  kind: "product" | "portfolio" | "site",
  source: Product | PortfolioItem | Site,
): string;
export function applyStructuredTranslations(
  base: StructuredSource,
  translation: unknown,
): StructuredSource & { sites: { fa: Site | null; en: Site | null } };
export function translationAuthoringSource(base: StructuredSource): Record<string, unknown>;
export function parseTranslationJson(raw: string): unknown;
export function readStructuredTranslations(url: URL): Promise<unknown | null>;
