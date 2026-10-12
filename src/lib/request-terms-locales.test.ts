import assert from "node:assert/strict";
import { test } from "node:test";

import {
  approvedTerms,
  validateTermsConsent,
} from "../../supabase/functions/_shared/terms-consent.ts";
import type { TermsRegistry } from "../../supabase/functions/_shared/terms-consent.ts";
import type { Page } from "./content/types";
import { isRequestTermsDocument } from "./request-form";
import type { RequestTermsDocument } from "./request-form";
import { interpretSubmitResponse } from "./request-submit";
import type { SubmitOutcome } from "./request-submit";
import { requestTermsDocumentFromPage } from "./request-terms";
import { refreshUpdatedTerms } from "./request-terms-update";

const FA = { locale: "fa", version: "test-v1", contentHash: "a".repeat(64) } as const;
const EN = { locale: "en", version: "test-v1", contentHash: "b".repeat(64) } as const;
const registry: TermsRegistry = {
  fa: {
    version: FA.version,
    currentContentHash: FA.contentHash,
    allowedContentHashes: [FA.contentHash],
  },
  en: {
    version: EN.version,
    currentContentHash: EN.contentHash,
    allowedContentHashes: [EN.contentHash],
  },
};
const updated: Extract<SubmitOutcome, { kind: "terms_updated" }> = {
  kind: "terms_updated",
  termsDocument: FA,
  termsDocuments: { fa: FA, en: EN },
};
const wire = (document: RequestTermsDocument) => ({
  locale: document.locale,
  version: document.version,
  content_hash: document.contentHash,
});
const response = (overrides: Record<string, unknown> = {}) => ({
  status: 409,
  body: JSON.stringify({
    code: "TERMS_UPDATED",
    terms: wire(FA),
    terms_by_locale: { fa: wire(FA), en: wire(EN) },
    ...overrides,
  }),
});

test("Terms document validation never treats a Persian document as an English translation", () => {
  const legacy = { version: FA.version, contentHash: FA.contentHash };
  assert.equal(isRequestTermsDocument(legacy, "fa"), true);
  assert.equal(isRequestTermsDocument(legacy, "en"), false);
  assert.equal(isRequestTermsDocument(FA, "en"), false);
  assert.equal(isRequestTermsDocument(EN, "fa"), false);
  assert.equal(isRequestTermsDocument(EN, "en"), true);
  for (const locale of [null, "ar", ["en"]])
    assert.equal(isRequestTermsDocument({ ...EN, locale }), false);
});

test("request acceptance metadata comes only from a nonempty Terms page in the active language", () => {
  const page: Page = {
    locale: "en",
    slug: "terms",
    title: "Test terms",
    body: "Synthetic test body.",
    seo: null,
    version: EN.version,
    contentHash: EN.contentHash,
  };
  assert.deepEqual(requestTermsDocumentFromPage(page, "en"), EN);
  assert.equal(requestTermsDocumentFromPage(page, "fa"), null);
  for (const invalid of [
    null,
    { ...page, slug: "about" as const },
    { ...page, body: " \n" },
    { ...page, version: undefined },
    { ...page, contentHash: "invalid" },
  ])
    assert.equal(requestTermsDocumentFromPage(invalid as Page | null, "en"), null);
});

test("Edge accepts either current reviewed translation without adding request fields", () => {
  for (const document of [FA, EN])
    assert.equal(
      validateTermsConsent(
        { terms_version: document.version, terms_content_hash: document.contentHash },
        registry,
      ),
      null,
    );
});

test("Edge rejects an old hash, wrong version and absent translation with current metadata", () => {
  for (const request of [
    { terms_version: "test-v0", terms_content_hash: FA.contentHash },
    { terms_version: FA.version, terms_content_hash: "c".repeat(64) },
  ]) {
    const result = validateTermsConsent(request, registry);
    assert.equal(result?.status, 409);
    assert.equal(result?.body.code, "TERMS_UPDATED");
    if (result?.body.code === "TERMS_UPDATED")
      assert.deepEqual(result.body.terms_by_locale, { fa: wire(FA), en: wire(EN) });
  }
  assert.equal(
    validateTermsConsent(
      { terms_version: EN.version, terms_content_hash: EN.contentHash },
      { fa: registry.fa, en: null },
    )?.status,
    409,
  );
});

test("empty or malformed Terms registries fail closed rather than authorizing stale consent", () => {
  const cases: unknown[] = [
    { fa: null, en: null },
    { ...registry, en: { ...registry.en, version: "test-v2" } },
    { ...registry, en: registry.fa },
    { ...registry, fa: { ...registry.fa, allowedContentHashes: [FA.contentHash, "c".repeat(64)] } },
    { ...registry, fa: { ...registry.fa, allowedContentHashes: ["c".repeat(64)] } },
    { ...registry, fa: { ...registry.fa, currentContentHash: [FA.contentHash] } },
    { ...registry, fa: { ...registry.fa, version: " test-v1 " } },
  ];
  for (const value of cases)
    assert.deepEqual(
      validateTermsConsent(
        { terms_version: FA.version, terms_content_hash: FA.contentHash },
        value as TermsRegistry,
      ),
      { ok: false, status: 503, body: { code: "TEMPORARILY_UNAVAILABLE" } },
    );
});

test("an English-only approved registry exposes no fabricated Persian release", () => {
  assert.deepEqual(approvedTerms({ fa: null, en: registry.en }), { en: wire(EN) });
  assert.equal(
    validateTermsConsent(
      { terms_version: EN.version, terms_content_hash: EN.contentHash },
      { fa: null, en: registry.en },
    ),
    null,
  );
});

test("the client decodes bilingual Terms updates without losing their explicit languages", () => {
  assert.deepEqual(interpretSubmitResponse(response()), updated);
});

test("malformed or inconsistent Terms update maps never enter the consent state", () => {
  for (const terms_by_locale of [
    null,
    [],
    {},
    { ar: wire(EN) },
    { fa: wire(EN) },
    { en: wire(EN) },
    { fa: wire(FA), en: { ...wire(EN), version: "test-v2" } },
    { fa: wire(FA), en: { ...wire(EN), content_hash: FA.contentHash } },
    { fa: { version: FA.version, content_hash: FA.contentHash } },
  ])
    assert.deepEqual(interpretSubmitResponse(response({ terms_by_locale })), {
      kind: "temporarily_unavailable",
    });
});

test("legacy Terms update responses remain usable only in the Persian flow", async () => {
  const outcome = interpretSubmitResponse({
    status: 409,
    body: JSON.stringify({
      code: "TERMS_UPDATED",
      terms: { version: FA.version, content_hash: FA.contentHash },
    }),
  });
  assert.equal(outcome.kind, "terms_updated");
  if (outcome.kind !== "terms_updated") return;
  let calls = 0;
  const read = async () => {
    calls++;
    return FA;
  };
  assert.equal(await refreshUpdatedTerms(outcome, "en", read), null);
  assert.equal(calls, 0);
  assert.deepEqual(await refreshUpdatedTerms(outcome, "fa", read), FA);
  assert.equal(calls, 1);
});

test("updated English consent is enabled only after the actual English page matches the Edge version and hash", async () => {
  let calls = 0;
  const result = await refreshUpdatedTerms(updated, "en", async (locale, signal) => {
    calls++;
    assert.equal(locale, "en");
    assert.equal(signal?.aborted, false);
    return EN;
  });
  assert.deepEqual(result, EN);
  assert.equal(calls, 1);
});

test("missing, old, mismatched or wrong-language refreshed pages keep acceptance blocked", async () => {
  for (const page of [
    null,
    FA,
    { ...EN, version: "test-v0" },
    { ...EN, contentHash: "c".repeat(64) },
  ])
    assert.equal(await refreshUpdatedTerms(updated, "en", async () => page), null);
  let calls = 0;
  assert.equal(
    await refreshUpdatedTerms({ ...updated, termsDocuments: { fa: FA } }, "en", async () => {
      calls++;
      return EN;
    }),
    null,
  );
  assert.equal(calls, 0);
});

test("a failed refresh preserves the blocked consent state", async () => {
  assert.equal(
    await refreshUpdatedTerms(updated, "en", async () => {
      throw new Error("Synthetic unavailable page");
    }),
    null,
  );
});

test("a hung Terms lookup times out and aborts instead of leaving the submit button busy indefinitely", async () => {
  let signal: AbortSignal | undefined;
  const result = await refreshUpdatedTerms(
    updated,
    "en",
    async (_locale, requestedSignal) => {
      signal = requestedSignal;
      return new Promise<RequestTermsDocument | null>(() => {});
    },
    10,
  );
  assert.equal(result, null);
  assert.equal(signal?.aborted, true);
});

test("Terms refresh performs no submission and cannot turn an update into success", async () => {
  const result = await refreshUpdatedTerms(updated, "fa", async () => FA);
  assert.deepEqual(result, FA);
  assert.equal(updated.kind, "terms_updated");
  assert.equal(Object.hasOwn(result!, "trackingCode"), false);
});
