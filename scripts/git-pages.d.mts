import type { Locale } from "../src/lib/i18n/locale";
import type { CompiledPage, Page, PageSlug } from "../src/lib/content/types";

export const PAGE_LOCALES: readonly Locale[];
export const ALLOWED_PAGE_SLUGS: ReadonlySet<PageSlug>;
export const MAX_FILE_BYTES: number;
export function computeTermsContentHash(version: string, body: string, locale?: Locale): string;
export function parseGitPage(
  raw: string,
  expectedSlug: PageSlug,
  expectedLocale?: Locale,
): CompiledPage | null;
export function termsReleases(
  pages: Readonly<Record<Locale, Partial<Record<PageSlug, Page>>>>,
): Record<
  Locale,
  { version: string; currentContentHash: string; allowedContentHashes: string[] } | null
>;
