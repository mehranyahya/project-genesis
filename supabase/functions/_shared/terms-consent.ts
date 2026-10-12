import type { TermsRelease } from "./terms-registry.generated.ts";

type Locale = "fa" | "en";
export type TermsRegistry = Readonly<Record<Locale, TermsRelease | null>>;
const HASH = /^[0-9a-f]{64}$/;

export interface PublicTermsDocument {
  readonly locale: Locale;
  readonly version: string;
  readonly content_hash: string;
}

export type TermsConsentFailure =
  | {
      readonly ok: false;
      readonly status: 503;
      readonly body: { readonly code: "TEMPORARILY_UNAVAILABLE" };
    }
  | {
      readonly ok: false;
      readonly status: 409;
      readonly body: {
        readonly code: "TERMS_UPDATED";
        readonly terms: PublicTermsDocument;
        readonly terms_by_locale: Readonly<Partial<Record<Locale, PublicTermsDocument>>>;
      };
    };

export function approvedTerms(
  registry: TermsRegistry,
): Partial<Record<Locale, PublicTermsDocument>> | null {
  const documents: Partial<Record<Locale, PublicTermsDocument>> = {};
  let version: string | null = null;
  const hashes = new Set<string>();
  for (const locale of ["fa", "en"] as const) {
    const release = registry[locale];
    if (release === null) continue;
    if (
      !release ||
      typeof release.version !== "string" ||
      release.version !== release.version.trim() ||
      release.version.length < 1 ||
      release.version.length > 80 ||
      typeof release.currentContentHash !== "string" ||
      !HASH.test(release.currentContentHash) ||
      !Array.isArray(release.allowedContentHashes) ||
      release.allowedContentHashes.length !== 1 ||
      release.allowedContentHashes[0] !== release.currentContentHash ||
      (version !== null && release.version !== version) ||
      hashes.has(release.currentContentHash)
    )
      return null;
    version = release.version;
    hashes.add(release.currentContentHash);
    documents[locale] = { locale, version, content_hash: release.currentContentHash };
  }
  return version === null ? null : documents;
}

/** A current hash identifies the approved language without changing request/RPC fields. */
export function validateTermsConsent(
  request: { readonly terms_version: string; readonly terms_content_hash: string },
  registry: TermsRegistry,
): TermsConsentFailure | null {
  const documents = approvedTerms(registry);
  if (documents === null)
    return { ok: false, status: 503, body: { code: "TEMPORARILY_UNAVAILABLE" } };
  const current = documents.fa ?? documents.en!;
  if (
    request.terms_version === current.version &&
    Object.values(documents).some(
      (document) => document.content_hash === request.terms_content_hash,
    )
  )
    return null;
  return {
    ok: false,
    status: 409,
    body: { code: "TERMS_UPDATED", terms: current, terms_by_locale: documents },
  };
}
