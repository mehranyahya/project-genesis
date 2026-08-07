import type { Page } from "./content/types";
import type { RequestTermsDocument } from "./request-form";
import { isRequestTermsDocument } from "./request-form";

/**
 * Converts only a real, versioned Terms page into the request acceptance
 * document. No title/body/SEO fallback can make an unversioned page submittable.
 */
export function requestTermsDocumentFromPage(page: Page | null): RequestTermsDocument | null {
  if (page?.slug !== "terms") return null;

  const candidate = {
    version: page.version,
    contentHash: page.contentHash,
  };
  return isRequestTermsDocument(candidate) ? candidate : null;
}
