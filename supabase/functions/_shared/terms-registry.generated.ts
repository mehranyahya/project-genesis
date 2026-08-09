// GENERATED ARTIFACT BOUNDARY.
// Real releases remain Git-versioned. Until content finalization generates a
// current release, submit-request must fail closed rather than inventing Terms.

export interface TermsRelease {
  readonly version: string;
  readonly currentContentHash: string;
  readonly allowedContentHashes: readonly string[];
}

export const CURRENT_TERMS_RELEASE: TermsRelease | null = null;
