import type { GuideDetailModel } from "./guides";
import type { Locale } from "./i18n/locale";
import { localizeRawPath } from "./i18n/locale";
import { allowsIndexing } from "./seo-indexing";

/** JSON for an inert script data block: never allow HTML/parser break-out. */
export function guideStructuredData(
  guide: GuideDetailModel,
  locale: Locale,
  canonical: string,
): string | null {
  if (
    !allowsIndexing(guide.robots) ||
    !guide.translationLocales.includes(locale) ||
    !guide.title.trim() ||
    !guide.blocks.length
  )
    return null;
  let url: URL;
  try {
    url = new URL(canonical);
  } catch {
    return null;
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== localizeRawPath(guide.path, locale)
  )
    return null;
  // Author, image and first-publication time are absent from the reviewed DTO.
  // Do not infer them, or turn its reviewed update date into datePublished.
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: guide.title,
    inLanguage: locale,
    url: url.href,
  }).replace(
    /[<>&\u2028\u2029]/g,
    (character) => "\\u" + character.charCodeAt(0).toString(16).padStart(4, "0"),
  );
}
