import { getPage } from "./content/adapters";
import type { Page } from "./content/types";
import type { RequestTermsDocument } from "./request-form";
import { isRequestTermsDocument } from "./request-form";
import { DEFAULT_LOCALE, type Locale } from "./i18n/locale";

/**
 * Converts only a real, versioned Terms page into the request acceptance
 * document. No title/body/SEO fallback can make an unversioned page submittable.
 */
export function requestTermsDocumentFromPage(
  page: Page | null,
  locale: Locale = DEFAULT_LOCALE,
): RequestTermsDocument | null {
  if (page?.slug !== "terms" || (page.locale ?? DEFAULT_LOCALE) !== locale || !page.body.trim())
    return null;

  const candidate = {
    locale,
    version: page.version,
    contentHash: page.contentHash,
  };
  return isRequestTermsDocument(candidate, locale) ? candidate : null;
}

/**
 * Locale-aware form accessor through the official Git-backed page adapter.
 * The active Edge backend uses the registry compiled from those same pages;
 * no runtime Markdown parsing or independent Terms copy is introduced.
 */
export async function getRequestTermsDocument(
  locale: Locale = DEFAULT_LOCALE,
  signal?: AbortSignal,
): Promise<RequestTermsDocument | null> {
  return requestTermsDocumentFromPage(
    await getPage("terms", locale, signal ? { signal } : undefined),
    locale,
  );
}
