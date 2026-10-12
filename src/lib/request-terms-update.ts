import type { Locale } from "./i18n/locale";
import { isRequestTermsDocument, type RequestTermsDocument } from "./request-form";
import { getRequestTermsDocument } from "./request-terms";
import type { SubmitOutcome } from "./request-submit";

type TermsUpdated = Extract<SubmitOutcome, { kind: "terms_updated" }>;

/** Metadata from an update is usable only after the same-language page matches. */
export async function refreshUpdatedTerms(
  outcome: TermsUpdated,
  locale: Locale,
  read: typeof getRequestTermsDocument = getRequestTermsDocument,
  timeoutMs = 10_000,
): Promise<RequestTermsDocument | null> {
  const expected = outcome.termsDocuments ? outcome.termsDocuments[locale] : outcome.termsDocument;
  if (!isRequestTermsDocument(expected, locale)) return null;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve(null);
      }, timeoutMs);
    });
    const current = await Promise.race([read(locale, controller.signal), timeout]);
    return isRequestTermsDocument(current, locale) &&
      current.version === expected.version &&
      current.contentHash === expected.contentHash
      ? current
      : null;
  } catch {
    return null;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    controller.abort();
  }
}
