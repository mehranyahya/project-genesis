import type { Guide } from "../src/lib/content/types";
import type { Locale } from "../src/lib/i18n/locale";
export const MAX_GUIDE_BYTES: number;
export const MAX_GUIDES_PER_LOCALE: number;
export function isGuideSlug(value: unknown): value is string;
export interface ReviewedGuide {
  guide: Guide;
  revision: string;
}
export function parseGitGuide(
  raw: string,
  expectedSlug: string,
  expectedLocale: Locale,
): ReviewedGuide | null;
export function compileGuides(records: Record<Locale, ReviewedGuide[]>): Record<Locale, Guide[]>;
