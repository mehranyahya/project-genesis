import { GIT_PAGES } from "./generated-pages";
import type { Page, PageSlug } from "./types";
import { PAGE_SLUGS } from "./types";
import { DEFAULT_LOCALE, isLocale, type Locale } from "../i18n/locale";

const PAGE_SLUG_SET = new Set<PageSlug>(PAGE_SLUGS);

/** Runtime consumes compiled public DTOs. Missing translations are absent. */
export async function loadGitPage(
  slug: PageSlug,
  locale: Locale = DEFAULT_LOCALE,
): Promise<Page | null> {
  if (!PAGE_SLUG_SET.has(slug) || !isLocale(locale)) return null;
  const page = GIT_PAGES[locale][slug];
  if (!page || page.slug !== slug || page.locale !== locale) return null;
  return { ...page, seo: page.seo ? { ...page.seo } : null };
}
