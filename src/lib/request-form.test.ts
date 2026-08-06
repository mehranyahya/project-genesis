import { test } from "node:test";
import assert from "node:assert/strict";

import type { GraveStoneRequestDraft } from "./request-draft";
import type { PriceType } from "./content/types";
import type { BuildingStoneValues } from "./building-stone";
import { EMPTY_BUILDING_STONE_VALUES, buildingStoneExtension } from "./building-stone";
import type {
  BuildingStoneExtensionContract,
  RequestFormValues,
  RequestSource,
} from "./request-form";
import {
  BUILDING_STONE_EXTENSION,
  EMPTY_REQUEST_FORM_VALUES,
  LOCATION_UNKNOWN_VALUE,
  PHONE_PATTERN,
  REQUEST_FIELD_ERRORS,
  TERMS_HASH_PATTERN,
  buildRequestPayload,
  isRequestTermsDocument,
  normalizePhone,
  requestSourceSelectionIdentity,
  resolveClientPrice,
  resolveRequestFormExtension,
  validateRequestForm,
} from "./request-form";

const HASH = "a".repeat(64);
const CATALOG = "b".repeat(64);
const TERMS = { version: "1.0.0", contentHash: HASH };

const draft = (priceType: PriceType, amountToman: number | null): GraveStoneRequestDraft => ({
  requestType: "grave_stone",
  catalogVersion: CATALOG,
  productId: "p-1",
  productCode: "MA-P-1",
  variantId: "v-1",
  stoneCode: "S-1",
  sizeCode: "160x60",
  optionIds: ["o-1"],
  displaySnapshot: {
    productTitle: "سنگ نمونه",
    productTypeLabel: "تک‌نفره",
    stoneCode: "S-1",
    sizeLabel: "۱۶۰×۶۰",
    optionTitles: ["دوری"],
    priceType,
    amountToman,
    priceLabel: "برآورد",
    priceUpdatedAt: "2026-01-01",
    includes: [],
    excludes: [],
  },
});

const graveSource = (priceType: PriceType, amount: number | null): RequestSource => ({
  kind: "grave_stone",
  draft: draft(priceType, amount),
});

const contactSource = (portfolioReferenceId: string | null): RequestSource => ({
  kind: "contact",
  portfolioReferenceId,
});

const filled = (over: Partial<RequestFormValues> = {}): RequestFormValues => ({
  ...EMPTY_REQUEST_FORM_VALUES,
  customerName: "علی رضایی",
  phone: "09121234567",
  city: "تهران",
  locationText: "بهشت زهرا",
  preferredContact: "phone",
  termsAccepted: true,
  ...over,
});

/* -------------------------------------------------------------------------- */
/* Phone                                                                       */
/* -------------------------------------------------------------------------- */

test("1 the three contractual phone shapes normalize to +989xxxxxxxxx", () => {
  assert.equal(normalizePhone("09121234567"), "+989121234567");
  assert.equal(normalizePhone("989121234567"), "+989121234567");
  assert.equal(normalizePhone("+989121234567"), "+989121234567");
  assert.equal(PHONE_PATTERN.source, "^\\+989[0-9]{9}$");
});

test("2 persian and arabic digits and separators are normalized", () => {
  assert.equal(normalizePhone("۰۹۱۲۱۲۳۴۵۶۷"), "+989121234567");
  assert.equal(normalizePhone("٠٩١٢١٢٣٤٥٦٧"), "+989121234567");
  assert.equal(normalizePhone(" 0912 123-45 67 "), "+989121234567");
});

test("3 a 00 prefix is rejected", () => {
  assert.equal(normalizePhone("00989121234567"), null);
  assert.equal(normalizePhone("۰۰۹۸۹۱۲۱۲۳۴۵۶۷"), null);
});

test("4 every other phone shape is rejected", () => {
  for (const bad of ["", "0912123456", "091212345678", "08121234567", "9121234567", "+981234"]) {
    assert.equal(normalizePhone(bad), null);
  }
});

/* -------------------------------------------------------------------------- */
/* Terms                                                                       */
/* -------------------------------------------------------------------------- */

test("5 a terms document needs a version and a 64-hex content hash", () => {
  assert.equal(TERMS_HASH_PATTERN.source, "^[0-9a-f]{64}$");
  assert.ok(isRequestTermsDocument(TERMS));
  assert.ok(!isRequestTermsDocument({ version: "", contentHash: HASH }));
  assert.ok(!isRequestTermsDocument({ version: "1", contentHash: "a".repeat(63) }));
  assert.ok(!isRequestTermsDocument({ version: "1", contentHash: "A".repeat(64) }));
  assert.ok(!isRequestTermsDocument(null));
});

/* -------------------------------------------------------------------------- */
/* Validation                                                                  */
/* -------------------------------------------------------------------------- */

test("6 a complete grave-stone form is valid and normalized", () => {
  const result = validateRequestForm({ values: filled(), source: graveSource("estimate", 100) });
  assert.equal(result.valid, true);
  assert.equal(result.firstInvalidField, null);
  assert.equal(result.fields?.phone, "+989121234567");
  assert.equal(result.fields?.city, "تهران");
});

test("7 city and location are required only for grave-stone requests", () => {
  const values = filled({ city: "", locationText: "" });
  const grave = validateRequestForm({ values, source: graveSource("review", null) });
  assert.equal(grave.errors.city, REQUEST_FIELD_ERRORS.cityRequired);
  assert.equal(grave.errors.locationText, REQUEST_FIELD_ERRORS.locationRequired);

  const contact = validateRequestForm({ values, source: contactSource(null) });
  assert.equal(contact.valid, true);
  assert.equal(contact.fields?.city, null);
});

test("8 the unknown-location choice fills the official location text", () => {
  const result = validateRequestForm({
    values: filled({ locationText: "", locationUnknown: true }),
    source: graveSource("review", null),
  });
  assert.equal(result.valid, true);
  assert.equal(result.fields?.location_text, LOCATION_UNKNOWN_VALUE);
});

test("9 length limits are enforced per field", () => {
  const result = validateRequestForm({
    values: filled({
      customerName: "ا",
      city: "ش".repeat(51),
      locationText: "م".repeat(201),
      preferredContactTime: "ز".repeat(101),
      customerNote: "ت".repeat(1001),
    }),
    source: graveSource("review", null),
  });
  assert.equal(result.errors.customerName, REQUEST_FIELD_ERRORS.customerName);
  assert.equal(result.errors.city, REQUEST_FIELD_ERRORS.cityLength);
  assert.equal(result.errors.locationText, REQUEST_FIELD_ERRORS.locationLength);
  assert.equal(result.errors.preferredContactTime, REQUEST_FIELD_ERRORS.preferredContactTime);
  assert.equal(result.errors.customerNote, REQUEST_FIELD_ERRORS.customerNote);
  assert.equal(result.fields, null);
});

test("10 contact method and terms acceptance are required", () => {
  const result = validateRequestForm({
    values: filled({ preferredContact: null, termsAccepted: false }),
    source: contactSource(null),
  });
  assert.equal(result.errors.preferredContact, REQUEST_FIELD_ERRORS.preferredContact);
  assert.equal(result.errors.termsAccepted, REQUEST_FIELD_ERRORS.termsAccepted);
});

test("11 the first invalid field follows the official field order", () => {
  const result = validateRequestForm({
    values: filled({ customerName: "", phone: "" }),
    source: contactSource(null),
  });
  assert.equal(result.firstInvalidField, "customerName");
});

/* -------------------------------------------------------------------------- */
/* Client price                                                                */
/* -------------------------------------------------------------------------- */

test("12 a valid numeric price is kept as is", () => {
  assert.deepEqual(resolveClientPrice("fixed", 500), { priceType: "fixed", amountToman: 500 });
  assert.deepEqual(resolveClientPrice("estimate", 500), {
    priceType: "estimate",
    amountToman: 500,
  });
});

test("13 review is valid only with a null amount", () => {
  assert.deepEqual(resolveClientPrice("review", null), { priceType: "review", amountToman: null });
  assert.equal(resolveClientPrice("review", 500), null);
});

test("14 an invalid numeric amount is rejected, never downgraded to review", () => {
  assert.equal(resolveClientPrice("fixed", null), null);
  assert.equal(resolveClientPrice("estimate", 0), null);
  assert.equal(resolveClientPrice("estimate", -1), null);
  assert.equal(resolveClientPrice("fixed", 1.5), null);
});

test("15 a revision replaces the snapshot price and is validated the same way", () => {
  assert.deepEqual(resolveClientPrice("fixed", 500, { priceType: "review", amountToman: null }), {
    priceType: "review",
    amountToman: null,
  });
  assert.equal(resolveClientPrice("fixed", 500, { priceType: "fixed", amountToman: 0 }), null);
});

/* -------------------------------------------------------------------------- */
/* Payload                                                                     */
/* -------------------------------------------------------------------------- */

test("16 a grave-stone payload carries the draft identifiers and the client price", () => {
  const payload = buildRequestPayload({
    submissionId: "sid-1",
    source: graveSource("estimate", 500),
    values: filled(),
    termsDocument: TERMS,
  });
  assert.ok(payload !== null);
  assert.equal(payload.request_type, "grave_stone");
  assert.equal(payload.submission_id, "sid-1");
  assert.equal(payload.terms_content_hash, HASH);
  assert.equal(payload.terms_accepted, true);
  if (payload.request_type !== "grave_stone") throw new Error("unreachable");
  assert.equal(payload.client_catalog_version, CATALOG);
  assert.equal(payload.client_price_type, "estimate");
  assert.equal(payload.client_displayed_price, 500);
});

test("17 an invalid client price blocks the payload entirely", () => {
  assert.equal(
    buildRequestPayload({
      submissionId: "sid-1",
      source: graveSource("fixed", null),
      values: filled(),
      termsDocument: TERMS,
    }),
    null,
  );
  assert.equal(
    buildRequestPayload({
      submissionId: "sid-1",
      source: graveSource("estimate", 0),
      values: filled(),
      termsDocument: TERMS,
    }),
    null,
  );
});

test("18 a missing or invalid terms document blocks the payload", () => {
  for (const terms of [null, { version: "1", contentHash: "x" }]) {
    assert.equal(
      buildRequestPayload({
        submissionId: "sid-1",
        source: contactSource(null),
        values: filled(),
        termsDocument: terms as never,
      }),
      null,
    );
  }
});

test("19 an invalid form or empty submission id blocks the payload", () => {
  assert.equal(
    buildRequestPayload({
      submissionId: "  ",
      source: contactSource(null),
      values: filled(),
      termsDocument: TERMS,
    }),
    null,
  );
  assert.equal(
    buildRequestPayload({
      submissionId: "sid-1",
      source: contactSource(null),
      values: filled({ termsAccepted: false }),
      termsDocument: TERMS,
    }),
    null,
  );
});

test("20 only a valid portfolio reference becomes a referral, never free text", () => {
  const referred = buildRequestPayload({
    submissionId: "sid-1",
    source: contactSource("pf-1001"),
    values: filled(),
    termsDocument: TERMS,
  });
  assert.ok(referred !== null && referred.request_type === "contact");
  assert.equal(referred.source_type, "portfolio");
  assert.equal(referred.portfolio_reference_id, "pf-1001");

  const rejected = buildRequestPayload({
    submissionId: "sid-1",
    source: contactSource("caption text"),
    values: filled(),
    termsDocument: TERMS,
  });
  assert.ok(rejected !== null && rejected.request_type === "contact");
  assert.equal(rejected.source_type, undefined);
  assert.equal(rejected.portfolio_reference_id, undefined);
});
