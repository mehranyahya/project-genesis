import { GIT_GUIDES } from "./generated-guides";
import type { Guide, GuideSummary, GuideQuery } from "./types";
import { DEFAULT_LOCALE, isLocale, LOCALES, type Locale } from "../i18n/locale";
import { isGuideSlug, MAX_GUIDES_PER_LOCALE } from "../../../scripts/guide-policy.mjs";
import { isIndexableGuide } from "./indexability";

/** Only generated public DTOs; no filesystem, network or source frontmatter. */
export async function loadGitGuides(query: GuideQuery = {}): Promise<GuideSummary[]> {
  const locale = query.locale ?? DEFAULT_LOCALE,
    limit = query.limit ?? MAX_GUIDES_PER_LOCALE;
  if (!isLocale(locale) || !Number.isInteger(limit) || limit < 1 || limit > MAX_GUIDES_PER_LOCALE)
    return [];
  return GIT_GUIDES[locale]
    .filter((guide) => guide.locale === locale && isGuideSlug(guide.slug))
    .slice(0, limit)
    .map(({ slug, title, summary, updatedAt }) => ({
      locale,
      slug,
      title,
      summary,
      updatedAt,
    }));
}

export async function loadGitGuide(
  slug: string,
  locale: Locale = DEFAULT_LOCALE,
): Promise<Guide | null> {
  if (!isGuideSlug(slug) || !isLocale(locale)) return null;
  const matches = GIT_GUIDES[locale].filter(
    (guide) => guide.slug === slug && guide.locale === locale,
  );
  if (matches.length !== 1) return null;
  const guide = matches[0]!;
  return {
    ...guide,
    seo: guide.seo ? { ...guide.seo } : null,
    translationLocales: LOCALES.filter((language) => {
      const counterparts = GIT_GUIDES[language].filter(
        (item) => item.slug === slug && item.locale === language,
      );
      return counterparts.length === 1 && isIndexableGuide(counterparts[0]!, language);
    }),
  };
}
