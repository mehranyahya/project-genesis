import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  EMPTY_REQUEST_FORM_VALUES,
  buildRequestPayload,
  isRequestTermsDocument,
  normalizePhone,
  validateRequestForm,
} from "@/lib/request-form";
import {
  buildQuoteReferralPath,
  findPortfolioReference,
  normalizePortfolioReference,
} from "@/lib/portfolio-reference";
import { interpretSubmitResponse } from "@/lib/request-submit";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

const FILES = [
  "lib/request-form.ts",
  "lib/request-submit.ts",
  "lib/portfolio-reference.ts",
  "components/request-form/request-form.tsx",
  "components/request-form/request-form-fields.tsx",
  "components/request-form/request-form-state.tsx",
  "components/request-form/request-success.tsx",
  "components/request-form/quote-page.tsx",
  "routes/quote.tsx",
];

const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const terms = { version: "1", contentHash: "a".repeat(64) } as const;

const validValues = {
  ...EMPTY_REQUEST_FORM_VALUES,
  customerName: "مهدی رضایی",
  phone: "۰۹۱۲۳۴۵۶۷۸۹",
  city: "تهران",
  locationText: "بهشت زهرا",
  preferredContact: "phone" as const,
  termsAccepted: true,
};

const contactSource = { kind: "contact", portfolioReferenceId: null } as const;

test("1 an empty form is invalid and reports the first invalid field", () => {
  const result = validateRequestForm({
    values: EMPTY_REQUEST_FORM_VALUES,
    source: contactSource,
  });
  assert.equal(result.valid, false);
  assert.equal(result.firstInvalidField, "customerName");
});

test("2 a complete form is valid", () => {
  const result = validateRequestForm({ values: validValues, source: contactSource });
  assert.equal(result.valid, true);
  assert.equal(result.firstInvalidField, null);
});

test("3 persian digits normalize to a latin mobile number", () => {
  assert.equal(normalizePhone("۰۹۱۲ ۳۴۵-۶۷۸۹"), "09123456789");
});

test("4 an invalid mobile number is rejected", () => {
  const result = validateRequestForm({
    values: { ...validValues, phone: "12345" },
    source: contactSource,
  });
  assert.equal(result.valid, false);
  assert.equal(result.firstInvalidField, "phone");
});

test("5 unaccepted terms invalidate the form", () => {
  const result = validateRequestForm({
    values: { ...validValues, termsAccepted: false },
    source: contactSource,
  });
  assert.equal(result.valid, false);
});

test("6 a payload is impossible without a valid terms document", () => {
  assert.equal(isRequestTermsDocument(null), false);
  assert.equal(
    buildRequestPayload({
      submissionId: "s-1",
      source: contactSource,
      values: validValues,
      termsDocument: null,
      priceRevision: null,
    }),
    null,
  );
});

test("7 a valid terms document produces a normalized payload", () => {
  const payload = buildRequestPayload({
    submissionId: "s-1",
    source: contactSource,
    values: validValues,
    termsDocument: terms,
    priceRevision: null,
  });
  assert.ok(payload);
  assert.equal(payload.phone, "09123456789");
  assert.equal(payload.terms_accepted, true);
  assert.equal(payload.terms_content_hash, terms.contentHash);
});

test("8 only an exact public portfolio reference is accepted", () => {
  assert.equal(normalizePortfolioReference("pf-1234"), "pf-1234");
  assert.equal(normalizePortfolioReference("pf-12"), null);
  assert.equal(normalizePortfolioReference(" caption "), null);
});

test("9 a reference must exist in the adapter output", () => {
  const items = [{ publicReferenceId: "pf-1234" }] as never;
  assert.equal(findPortfolioReference(items, "pf-1234"), "pf-1234");
  assert.equal(findPortfolioReference(items, "pf-9999"), null);
  assert.equal(findPortfolioReference([], "pf-1234"), null);
});

test("10 the referral path carries only source and reference", () => {
  assert.equal(buildQuoteReferralPath("pf-1234"), "/quote?source=portfolio&reference=pf-1234");
  assert.equal(buildQuoteReferralPath("nope"), null);
});

test("11 only a valid tracking code produces success", () => {
  const ok = interpretSubmitResponse(201, { code: "REQUEST_CREATED", tracking_code: "MA-1001" });
  assert.equal(ok.kind, "success");
  const bad = interpretSubmitResponse(201, { code: "REQUEST_CREATED", tracking_code: "MA-0001" });
  assert.notEqual(bad.kind, "success");
});

test("12 known server outcomes map to explicit states", () => {
  assert.equal(interpretSubmitResponse(409, { code: "SELECTION_UNAVAILABLE" }).kind, "selection_unavailable");
  assert.equal(interpretSubmitResponse(422, { code: "VALIDATION_ERROR" }).kind, "validation_error");
  assert.equal(interpretSubmitResponse(429, { code: "RATE_LIMITED" }).kind, "rate_limited");
  assert.equal(interpretSubmitResponse(503, {}).kind, "temporarily_unavailable");
});

test("13 no raw color and no banned effect exists in the new files", () => {
  const rawColor = /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(/;
  const banned =
    /gradient|backdrop-filter|backdrop-blur|blur\(|animate-|shimmer|spinner|mix-blend|shadow-(lg|xl|2xl)/i;
  for (const rel of FILES) {
    const code = stripComments(read(rel));
    assert.ok(!rawColor.test(code), `raw color in ${rel}`);
    assert.ok(!banned.test(code), `banned effect in ${rel}`);
  }
});

test("14 personal data never reaches storage, the URL or a log", () => {
  for (const rel of FILES) {
    const code = stripComments(read(rel));
    assert.ok(!code.includes("localStorage"), `localStorage in ${rel}`);
    assert.ok(!code.includes("document.cookie"), `cookie in ${rel}`);
    assert.ok(!/console\.(log|info|warn|error)/.test(code), `log in ${rel}`);
  }
  const submit = read("lib/request-submit.ts");
  assert.ok(submit.includes("sessionStorage"));
  assert.ok(submit.includes("trackingCode"));
});

test("15 the quote route validates its search and reads official adapters only", () => {
  const route = read("routes/quote.tsx");
  assert.ok(route.includes("validateSearch"));
  assert.ok(route.includes("getPortfolioItems()"));
  assert.ok(route.includes("getSite()"));
  assert.ok(!route.includes("getProducts("));
});

test("16 the submit surface keeps a single tracking-code contract", () => {
  assert.ok(read("lib/request-submit.ts").includes("^MA-[1-9][0-9]{3,}$"));
});
