import { test } from "node:test";
import assert from "node:assert/strict";
import { translatorFor } from "./i18n/messages";
import { STONEWORK_CATEGORIES } from "./stoneworks";
import {
  EMPTY_REQUEST_FORM_VALUES,
  buildRequestPayload,
  validateRequestForm,
} from "./request-form";
import {
  createGenerationTracker,
  isStaleAttempt,
  sourceIdentity,
} from "@/components/request-form/request-form";
import {
  stoneworkNoteLimit,
  stoneworkRequestIdentity,
  valuesForStoneworkRequest,
} from "./stonework-request";
import type { StoneworkRequestContext } from "./stonework-request";
import type { RequestFormValues, RequestSource } from "./request-form";

const SOURCE: RequestSource = { kind: "contact", portfolioReferenceId: null };
const TERMS = { version: "1.0.0", contentHash: "a".repeat(64) };
const VALUES: RequestFormValues = Object.freeze({
  ...EMPTY_REQUEST_FORM_VALUES,
  customerName: "Example Person",
  phone: "09121234567",
  preferredContact: "phone",
  termsAccepted: true,
  customerNote: "120 × 60 × 40 cm; honed marble; indoor table.",
});

test("every category and the original dimensions and brief reach the existing note payload in both locales", () => {
  for (const locale of ["fa", "en"] as const) {
    const t = translatorFor(locale);
    for (const category of STONEWORK_CATEGORIES) {
      const context = { id: category.id, label: t(category.label) };
      const values = valuesForStoneworkRequest(VALUES, context, t);
      const payload = buildRequestPayload({
        submissionId: "test-commission",
        source: SOURCE,
        values,
        termsDocument: TERMS,
      });
      assert.ok(payload);
      assert.equal(payload.request_type, "contact");
      assert.ok(payload.customer_note?.includes(t(category.label)));
      assert.ok(payload.customer_note?.includes(VALUES.customerNote));
      assert.equal(payload.customer_name, VALUES.customerName);
      assert.equal(payload.phone, "+989121234567");
      assert.equal("category" in payload, false);
      assert.equal("dimensions" in payload, false);
      if (locale === "en") assert.equal(/[\u0600-\u06FF]/.test(payload.customer_note!), false);
    }
  }
  assert.equal(VALUES.customerNote, "120 × 60 × 40 cm; honed marble; indoor table.");
});

test("removing a category preserves the editable contact details and brief without an old category prefix", () => {
  const t = translatorFor("en");
  const context: StoneworkRequestContext = {
    id: "sculpture_art",
    label: "Sculpture and stone art",
  };
  const selected = valuesForStoneworkRequest(VALUES, context, t);
  assert.notEqual(selected, VALUES);
  const cleared = valuesForStoneworkRequest(VALUES, null, t);
  assert.equal(cleared, VALUES);
  assert.equal(cleared.customerNote.includes(context.label), false);
  assert.equal(cleared.customerName, VALUES.customerName);
});

test("the editable note allowance keeps the complete transmitted note within the unchanged 1000-character contract", () => {
  for (const locale of ["fa", "en"] as const) {
    const t = translatorFor(locale);
    for (const category of STONEWORK_CATEGORIES) {
      const context = { id: category.id, label: t(category.label) };
      const limit = stoneworkNoteLimit(context, t);
      const values = valuesForStoneworkRequest(
        { ...VALUES, customerNote: "x".repeat(limit) },
        context,
        t,
      );
      assert.equal(values.customerNote.length, 1000);
      assert.equal(validateRequestForm({ source: SOURCE, values }).valid, true);
      const tooLong = valuesForStoneworkRequest(
        { ...VALUES, customerNote: "x".repeat(limit + 1) },
        context,
        t,
      );
      assert.ok(validateRequestForm({ source: SOURCE, values: tooLong }).errors.customerNote);
      assert.equal(
        buildRequestPayload({
          submissionId: "test-limit",
          source: SOURCE,
          values: tooLong,
          termsDocument: TERMS,
        }),
        null,
      );
    }
  }
});

test("changing a commission category invalidates an old request attempt, including an A to B to A cycle", () => {
  const source = sourceIdentity(SOURCE);
  const a: StoneworkRequestContext = { id: "sculpture_art", label: "Sculpture" };
  const b: StoneworkRequestContext = { id: "water_landscape", label: "Water features" };
  const tracker = createGenerationTracker(stoneworkRequestIdentity(source, a));
  const attempt = tracker.current();
  assert.equal(tracker.observe(stoneworkRequestIdentity(source, { ...a })), attempt);
  tracker.observe(stoneworkRequestIdentity(source, b));
  tracker.observe(stoneworkRequestIdentity(source, a));
  assert.equal(isStaleAttempt(attempt, tracker.current()), true);
  assert.equal(stoneworkRequestIdentity(source, null), source);
  assert.equal(stoneworkRequestIdentity(source, a).includes(VALUES.customerName), false);
});
