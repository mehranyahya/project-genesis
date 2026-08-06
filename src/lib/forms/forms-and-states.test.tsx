import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  createGenerationTracker,
  isStaleAttempt,
  sourceIdentity,
} from "../../components/request-form/request-form";
import type {
  RequestFieldErrors,
  RequestFormValues,
  RequestPayload,
  RequestSource,
  RequestTermsDocument,
} from "../request-form";
import {
  EMPTY_REQUEST_FORM_VALUES,
  REQUEST_FIELD_ORDER,
  buildRequestPayload,
} from "../request-form";
import type { RequestSubmitTransport, SubmitOutcome } from "../request-submit";
import { createSubmissionId, submitRequest } from "../request-submit";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

const FORM = "components/request-form/request-form.tsx";
const FIELDS = "components/request-form/request-form-fields.tsx";
const STATE = "components/request-form/request-form-state.tsx";
const SUCCESS = "components/request-form/request-success.tsx";
const QUOTE_PAGE = "components/request-form/quote-page.tsx";
const QUOTE_ROUTE = "routes/quote.tsx";
const MODEL = "lib/request-form.ts";
const SUBMIT = "lib/request-submit.ts";
const REFERENCE = "lib/portfolio-reference.ts";

const FILES = [FORM, FIELDS, STATE, SUCCESS, QUOTE_PAGE, QUOTE_ROUTE, MODEL, SUBMIT, REFERENCE];

const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const ALL_CODE = FILES.map((rel) => stripComments(read(rel))).join("\n");

test("1 no direct JSON, markdown, fixture or asset import exists", () => {
  assert.ok(!/from\s+["'][^"']*\.(json|md|mdx|png|jpe?g|svg|webp|avif|woff2?)["']/.test(ALL_CODE));
  assert.ok(!/fixture/i.test(ALL_CODE));
});

test("2 no absolute URL, secret or backend key appears in the form surface", () => {
  // The single allowed absolute URL is the WhatsApp deep link built from the
  // site adapter contact value; no backend URL or key may appear anywhere.
  for (const match of ALL_CODE.match(/https?:\/\/[^\s`"']*/g) ?? []) {
    assert.ok(match.startsWith("https://wa.me/"), `unexpected absolute URL ${match}`);
  }
  assert.ok(!/supabase|api[_-]?key|secret|token\s*=/i.test(ALL_CODE));
});

test("3 the submit endpoint is same-origin and used only through the shared module", () => {
  assert.ok(read(SUBMIT).includes('export const SUBMIT_ENDPOINT = "/api/submit-request"'));
  assert.ok(!stripComments(read(FORM)).includes("fetch("));
  assert.ok(stripComments(read(FORM)).includes("submitRequest"));
});

test("4 no raw color, gradient, blur or shadow token is used", () => {
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(ALL_CODE));
  assert.ok(!/\b(rgb|rgba|hsl|hsla)\(/.test(ALL_CODE));
  assert.ok(!/\b(bg|text|border)-(white|black|gray|slate|zinc|red|green|blue)-/.test(ALL_CODE));
  assert.ok(!/(gradient|backdrop-blur|backdrop-filter|blur-|shadow-(lg|xl|2xl))/.test(ALL_CODE));
});

test("5 no spinner, animation or auto carousel is used", () => {
  assert.ok(!/animate-(spin|pulse|bounce|ping)|spinner|carousel/i.test(ALL_CODE));
});

test("6 every interactive control keeps the 44px target and a visible focus ring", () => {
  for (const rel of [FORM, FIELDS, STATE, QUOTE_PAGE]) {
    const source = read(rel);
    assert.ok(source.includes("min-h-11"), `${rel} must keep the 44px target`);
    assert.ok(source.includes("outline-focus"), `${rel} must keep a visible focus ring`);
  }
});

test("7 the terms label is the official sentence, present once, with a real /terms link", () => {
  const fields = read(FIELDS);
  assert.ok(fields.includes('to="/terms"'));
  assert.ok(fields.includes('TERMS_LINK_TEXT = "شرایط ثبت"'));
  assert.ok(fields.includes("REQUEST_FIELD_LABELS.termsAccepted.slice(TERMS_LINK_TEXT.length)"));
  // The sentence is never written twice into the accessible label.
  assert.equal(fields.split("{TERMS_LABEL_TAIL}").length - 1, 1);
  assert.equal(fields.split("{TERMS_LINK_TEXT}").length - 1, 1);
});

test("8 every field is linked to its label and its error message", () => {
  const fields = read(FIELDS);
  assert.ok(fields.includes("htmlFor={fieldId("));
  assert.ok(fields.includes("aria-invalid="));
  assert.ok(fields.includes("aria-errormessage={"));
  assert.ok(fields.includes("errorId("));
});

test("9 the submit button is blocked until a valid terms document exists", () => {
  const form = read(FORM);
  assert.ok(form.includes("isRequestTermsDocument"));
  assert.ok(form.includes("disabled={!termsReady || submitting || selectionBlocked}"));
  assert.ok(form.includes("SUBMISSION_BLOCKED_TEXT"));
});

test("10 the blocked selection state clears only on a real selection change", () => {
  const form = read(FORM);
  assert.ok(form.includes("function sourceIdentity("));
  assert.ok(form.includes("const identity = sourceIdentity(source)"));
  assert.ok(form.includes("}, [identity]);"));
  assert.ok(!form.includes("}, [source]);"));
});

test("11 success is rendered only from a validated tracking code", () => {
  const form = read(FORM);
  assert.ok(form.includes('case "success":'));
  assert.ok(form.includes("setTrackingCode(result.trackingCode)"));
  assert.ok(form.includes('phase === "success" && trackingCode !== null'));
  assert.ok(!/setPhase\(\s*"success"\s*\)[\s\S]{0,80}catch/.test(form));
});

test("12 a failed attempt keeps the entered data and clears it only on success", () => {
  const form = stripComments(read(FORM));
  assert.equal(form.split("setValues(PII_FREE_VALUES)").length - 1, 1);
  const successIndex = form.indexOf('case "success":');
  assert.ok(successIndex > 0);
  assert.ok(form.indexOf("setValues(PII_FREE_VALUES)") > successIndex);
});

test("13 double submission is guarded by one in-flight submission id", () => {
  const form = read(FORM);
  assert.ok(form.includes("inFlight"));
  assert.ok(form.includes("if (inFlight.current) return;"));
  assert.ok(form.includes("if (submissionId.current === null) submissionId.current ="));
});

test("14 an idempotency conflict offers a new attempt with a fresh id", () => {
  const form = read(FORM);
  const state = read(STATE);
  assert.ok(form.includes("onNewAttempt"));
  assert.ok(form.includes("submissionId.current = null"));
  assert.ok(state.includes("SUBMIT_MESSAGES.idempotency_action"));
  assert.ok(state.includes("onClick={onNewAttempt}"));
});

test("15 every non-success outcome has its own announced state", () => {
  const state = read(STATE);
  for (const kind of [
    "price_changed",
    "selection_unavailable",
    "terms_updated",
    "idempotency_conflict",
    "validation_error",
    "bot_verification_invalid",
    "rate_limited",
  ]) {
    assert.ok(state.includes(kind), `missing state for ${kind}`);
  }
  assert.ok(state.includes('role="status"'));
  assert.ok(state.includes('aria-live="polite"'));
  assert.ok(state.includes('role="alert"'));
});

test("16 a raw server message is never rendered", () => {
  const state = read(STATE);
  assert.ok(!/\{outcome\.(message|detail|error)/.test(state));
  assert.ok(state.includes("SUBMIT_MESSAGES."));
});

test("17 personal data never reaches the URL, storage or a log", () => {
  assert.ok(!/localStorage/.test(ALL_CODE));
  assert.ok(!/console\.(log|info|warn|error)/.test(ALL_CODE));
  const submit = stripComments(read(SUBMIT));
  assert.equal(submit.split("sessionStorage").length - 1, 2);
  assert.ok(submit.includes("TRACKING_STORAGE_KEY"));
  assert.ok(!/sessionStorage/.test(stripComments(read(FORM))));
  const form = stripComments(read(FORM));
  for (const key of ["customerName", "phone", "city", "locationText", "customerNote"]) {
    assert.ok(!form.includes(`search: { ${key}`), `${key} must never enter the URL`);
  }
});

test("18 the quote route accepts only an exact portfolio reference", () => {
  const route = read(QUOTE_ROUTE);
  assert.ok(route.includes("findPortfolioReference"));
  assert.ok(route.includes("getPortfolioItems"));
  assert.ok(route.includes("getSite()"));
  assert.ok(!route.includes("caption"));
});

test("19 the form is mounted from the shared component on every surface", () => {
  for (const rel of [
    "components/product/product-detail-page.tsx",
    "components/custom-funnel/custom-funnel-page.tsx",
    QUOTE_PAGE,
  ]) {
    const source = read(rel);
    assert.ok(source.includes("<RequestForm"), `${rel} must mount the shared RequestForm`);
    assert.ok(
      source.includes('from "@/components/request-form/request-form"'),
      `${rel} must import the shared RequestForm`,
    );
  }
});

test("20 the grid contract of the form surface is 4/8/12", () => {
  const form = read(FORM);
  assert.ok(form.includes("grid-cols-4"));
  assert.ok(form.includes("md:grid-cols-8"));
  assert.ok(form.includes("lg:grid-cols-12"));
});

test("21 a server validation error is ordered through REQUEST_FIELD_ORDER and focused after commit", () => {
  const form = stripComments(read(FORM));
  assert.ok(form.includes("REQUEST_FIELD_ORDER"));
  assert.ok(form.includes("function firstMappedFieldError("));
  assert.ok(form.includes("setPendingFocus(firstMappedFieldError(result.fieldErrors))"));
  assert.ok(form.includes("}, [pendingFocus]);"));
  assert.ok(form.includes("document.getElementById(fieldId(pendingFocus))"));
  assert.ok(form.includes('if (pendingFocus === null || typeof document === "undefined") return;'));
  // Only the already-sanitized client map is stored.
  assert.ok(form.includes("setErrors(result.fieldErrors)"));
  assert.ok(!/result\.(message|detail|serverMessage)/.test(form));
});

test("22 the client-side first-invalid-field focus is preserved", () => {
  const form = stripComments(read(FORM));
  assert.ok(form.includes("focusFirstInvalid(validation)"));
  assert.ok(form.includes("validation.firstInvalidField"));
});

test("23 an idempotency outcome never submits again automatically", () => {
  const form = stripComments(read(FORM));
  const marker = form.indexOf('case "idempotency_conflict":');
  assert.ok(marker > 0);
  const branch = form.slice(marker, form.indexOf('case "validation_error":', marker));
  assert.ok(branch.includes("setFreshAttemptRequired(true)"));
  assert.ok(!/run\(/.test(branch), "the idempotency branch must not start a new run");
  assert.ok(!/setTimeout|setInterval|retryCount|autoRetry/.test(form));
});

test("24 the dedicated new-attempt action clears the id and runs once with the price revision", () => {
  const form = stripComments(read(FORM));
  const start = form.indexOf("onNewAttempt={");
  assert.ok(start > 0);
  const handler = form.slice(start, form.indexOf("}}", start));
  assert.ok(handler.includes("submissionId.current = null"));
  assert.ok(handler.includes("setOutcome(null)"));
  assert.ok(handler.includes("setFreshAttemptRequired(false)"));
  assert.ok(handler.includes("void run(priceRevision, { allowFreshAttempt: true })"));
  assert.equal(handler.split("run(").length - 1, 1);
  assert.ok(
    form.includes(
      "if (submissionId.current === null) submissionId.current = createSubmissionId();",
    ),
  );
});

test("25 a real semantic source change invalidates the source-coupled state only", () => {
  const form = stripComments(read(FORM));
  const start = form.indexOf("useEffect(() => {\n    submissionId.current = null;");
  assert.ok(start > 0, "the identity reset effect must exist");
  const effect = form.slice(start, form.indexOf("}, [identity]);", start));
  for (const call of [
    "submissionId.current = null",
    "inFlight.current = false",
    "setOutcome(null)",
    "setSelectionBlocked(false)",
    "setPriceRevision(null)",
    "setErrors({})",
    "setTrackingCode(null)",
    'setPhase("editing")',
  ]) {
    assert.ok(effect.includes(call), `the identity reset must include ${call}`);
  }
  // The entered values and the terms document survive a source change.
  assert.ok(!effect.includes("setValues("));
  assert.ok(!effect.includes("setTerms("));
});

test("26 the reset depends on semantic identity, not object reference", () => {
  const form = stripComments(read(FORM));
  assert.ok(form.includes("const identity = sourceIdentity(source)"));
  assert.ok(form.includes("}, [identity]);"));
  assert.ok(!form.includes("}, [source]);"));
  assert.ok(!form.includes("}, [source, "));
});

test("27 a response from an obsolete source attempt is discarded before any state is applied", () => {
  const form = stripComments(read(FORM));
  assert.ok(form.includes("const attemptIdentity = useRef(identity)"));
  assert.ok(form.includes("attemptIdentity.current = identity;"));
  assert.ok(form.includes("const attempt = attemptIdentity.current;"));
  const guard = form.indexOf("if (attempt !== attemptIdentity.current) return;");
  assert.ok(guard > 0, "a stale attempt guard must exist");
  const awaitIndex = form.indexOf("const result = await submitRequest(");
  assert.ok(awaitIndex > 0 && guard > awaitIndex);
  // No result state may be applied before the guard.
  assert.ok(form.indexOf("setOutcome(result)") > guard);
  assert.ok(form.indexOf("inFlight.current = false;\n      setOutcome(result)") > guard);
});

/* -------------------------------------------------------------------------- */
/* Runtime contracts: generation isolation and dedicated idempotency restart   */
/* -------------------------------------------------------------------------- */

const TERMS: RequestTermsDocument = { version: "1.0", contentHash: "a".repeat(64) };

const VALUES: RequestFormValues = {
  customerName: "علی رضایی",
  phone: "09121234567",
  city: "تهران",
  locationText: "آرامستان بهشت زهرا",
  locationUnknown: false,
  preferredContact: "phone",
  preferredContactTime: "",
  customerNote: "",
  termsAccepted: true,
};

const contactSource = (reference: string | null): RequestSource => ({
  kind: "contact",
  portfolioReferenceId: reference,
});

const reply = (status: number, body: unknown) => ({ status, body: JSON.stringify(body) });

interface Recorded {
  outcome: SubmitOutcome | null;
  errors: RequestFieldErrors;
  pendingFocus: string | null;
  trackingCode: string | null;
  selectionBlocked: boolean;
  priceRevision: unknown;
  values: RequestFormValues;
  successCalls: string[];
  storage: string | null;
  inFlight: boolean;
  freshAttemptRequired: boolean;
}

/**
 * A headless harness with exactly the guard order of the component: identity,
 * generation, then mutation. It drives the real submit module through a mock
 * transport, so outcomes and payloads are real, not simulated.
 */
function createHarness(initialSource: RequestSource, transport: RequestSubmitTransport) {
  let source = initialSource;
  const tracker = createGenerationTracker(sourceIdentity(source));
  let submissionId: string | null = null;
  const state: Recorded = {
    outcome: null,
    errors: {},
    pendingFocus: null,
    trackingCode: null,
    selectionBlocked: false,
    priceRevision: null,
    values: VALUES,
    successCalls: [],
    storage: null,
    inFlight: false,
    freshAttemptRequired: false,
  };
  const payloads: RequestPayload[] = [];

  const setSource = (next: RequestSource) => {
    source = next;
    const changed = tracker.observe(sourceIdentity(next));
    void changed;
    submissionId = null;
    state.inFlight = false;
    state.outcome = null;
    state.selectionBlocked = false;
    state.priceRevision = null;
    state.errors = {};
    state.trackingCode = null;
    state.pendingFocus = null;
    state.freshAttemptRequired = false;
  };

  const run = async (options?: { allowFreshAttempt?: boolean }) => {
    const allowFreshAttempt = options?.allowFreshAttempt === true;
    if (state.inFlight) return;
    if (state.selectionBlocked) return;
    if (state.freshAttemptRequired && !allowFreshAttempt) return;

    submissionId ??= createSubmissionId();
    const payload = buildRequestPayload({
      submissionId,
      source,
      values: state.values,
      termsDocument: TERMS,
      priceRevision: null,
    });
    if (payload === null) throw new Error("payload must build");
    payloads.push(payload);

    const attemptGeneration = tracker.current();
    state.inFlight = true;

    const result = await submitRequest({ payload, transport });

    if (isStaleAttempt(attemptGeneration, tracker.current())) return;

    state.inFlight = false;
    state.outcome = result;
    switch (result.kind) {
      case "success":
        state.trackingCode = result.trackingCode;
        state.storage = result.trackingCode;
        state.values = EMPTY_REQUEST_FORM_VALUES;
        submissionId = null;
        state.successCalls.push(result.trackingCode);
        break;
      case "price_changed":
        state.priceRevision = result.price;
        break;
      case "selection_unavailable":
        state.selectionBlocked = true;
        break;
      case "idempotency_conflict":
      case "idempotency_expired":
        state.freshAttemptRequired = true;
        break;
      case "validation_error":
        state.errors = result.fieldErrors;
        state.pendingFocus = firstMappedFieldError(result.fieldErrors);
        break;
      default:
        break;
    }
  };

  const newAttempt = async () => {
    // Exactly the component order: guard first, mutation afterwards.
    if (state.inFlight) return;
    submissionId = null;
    state.outcome = null;
    state.freshAttemptRequired = false;
    await run({ allowFreshAttempt: true });
  };

  return {
    state,
    payloads,
    setSource,
    run,
    newAttempt,
    generation: () => tracker.current(),
    submissionId: () => submissionId,
  };
}

const firstMappedFieldError = (errors: RequestFieldErrors): string | null =>
  REQUEST_FIELD_ORDER.find((key) => errors[key] !== undefined) ?? null;

/** A transport that resolves only when the test releases it. */
function deferredTransport(response: { status: number; body: string }) {
  let release: (() => void) | null = null;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const transport: RequestSubmitTransport = async () => {
    await gate;
    return response;
  };
  return { transport, release: () => release?.() };
}

test("28 the generation token separates an A to B to A source cycle", () => {
  const a = contactSource("pf-1001");
  const b = contactSource("pf-2002");
  const tracker = createGenerationTracker(sourceIdentity(a));
  const first = tracker.current();
  assert.equal(tracker.observe(sourceIdentity({ ...a })), first, "same semantics, same generation");
  const second = tracker.observe(sourceIdentity(b));
  assert.notEqual(second, first);
  const third = tracker.observe(sourceIdentity(a));
  assert.notEqual(third, second);
  assert.notEqual(third, first);
  assert.ok(isStaleAttempt(first, third));
  assert.ok(!isStaleAttempt(third, tracker.current()));
});

test("29 an ABA success of the first attempt is ignored completely", async () => {
  const created = deferredTransport(
    reply(201, { code: "REQUEST_CREATED", tracking_code: "MA-1001" }),
  );
  const harness = createHarness(contactSource("pf-1001"), created.transport);
  const pending = harness.run();
  harness.setSource(contactSource("pf-2002"));
  harness.setSource(contactSource("pf-1001"));
  created.release();
  await pending;
  assert.equal(harness.state.outcome, null);
  assert.equal(harness.state.trackingCode, null);
  assert.equal(harness.state.storage, null);
  assert.deepEqual(harness.state.successCalls, []);
  assert.equal(harness.state.values.customerName, VALUES.customerName);
});

test("30 an ABA price_changed of the first attempt never applies a price revision", async () => {
  const changed = deferredTransport(
    reply(409, { code: "PRICE_CHANGED", price: { price_type: "estimate", amount_toman: 900000 } }),
  );
  const harness = createHarness(contactSource("pf-1001"), changed.transport);
  const pending = harness.run();
  harness.setSource(contactSource("pf-2002"));
  harness.setSource(contactSource("pf-1001"));
  changed.release();
  await pending;
  assert.equal(harness.state.priceRevision, null);
  assert.equal(harness.state.outcome, null);
});

test("31 an ABA selection_unavailable never blocks the new source", async () => {
  const blocked = deferredTransport(reply(409, { code: "SELECTION_UNAVAILABLE" }));
  const harness = createHarness(contactSource("pf-1001"), blocked.transport);
  const pending = harness.run();
  harness.setSource(contactSource("pf-2002"));
  harness.setSource(contactSource("pf-1001"));
  blocked.release();
  await pending;
  assert.equal(harness.state.selectionBlocked, false);
});

test("32 an ABA validation_error applies neither errors nor focus", async () => {
  const invalid = deferredTransport(
    reply(422, { code: "VALIDATION_ERROR", field_errors: { phone: "x" } }),
  );
  const harness = createHarness(contactSource("pf-1001"), invalid.transport);
  const pending = harness.run();
  harness.setSource(contactSource("pf-2002"));
  harness.setSource(contactSource("pf-1001"));
  invalid.release();
  await pending;
  assert.deepEqual(harness.state.errors, {});
  assert.equal(harness.state.pendingFocus, null);
});

test("33 a stale response cannot clear the in-flight flag of the current request", async () => {
  const slow = deferredTransport(reply(201, { code: "REQUEST_CREATED", tracking_code: "MA-1001" }));
  const harness = createHarness(contactSource("pf-1001"), slow.transport);
  const pending = harness.run();
  harness.setSource(contactSource("pf-2002"));
  harness.setSource(contactSource("pf-1001"));
  harness.state.inFlight = true; // a new request of the current generation is running
  slow.release();
  await pending;
  assert.equal(harness.state.inFlight, true);
});

test("34 a re-render with the same semantic source never makes the running attempt stale", async () => {
  const created = deferredTransport(
    reply(201, { code: "REQUEST_CREATED", tracking_code: "MA-1234" }),
  );
  const harness = createHarness(contactSource("pf-1001"), created.transport);
  const pending = harness.run();
  harness.setSource(contactSource("pf-1001"));
  created.release();
  await pending;
  assert.equal(harness.state.trackingCode, "MA-1234");
  assert.deepEqual(harness.state.successCalls, ["MA-1234"]);
  assert.equal(harness.state.values.customerName, "");
});

test("35 an idempotency conflict starts no automatic request and blocks the main submit", async () => {
  let calls = 0;
  const transport: RequestSubmitTransport = async () => {
    calls += 1;
    return reply(409, { code: "IDEMPOTENCY_CONFLICT" });
  };
  const harness = createHarness(contactSource(null), transport);
  await harness.run();
  assert.equal(calls, 1);
  assert.equal(harness.state.outcome?.kind, "idempotency_conflict");
  await harness.run(); // main submit
  await harness.run(); // Enter key
  assert.equal(calls, 1);
});

test("36 an expired idempotency id starts no automatic request and blocks the main submit", async () => {
  let calls = 0;
  const transport: RequestSubmitTransport = async () => {
    calls += 1;
    return reply(409, { code: "IDEMPOTENCY_EXPIRED" });
  };
  const harness = createHarness(contactSource(null), transport);
  await harness.run();
  assert.equal(harness.state.outcome?.kind, "idempotency_expired");
  await harness.run();
  await harness.run();
  assert.equal(calls, 1);
});

test("37 the dedicated action performs exactly one attempt with a fresh submission id", async () => {
  let calls = 0;
  const transport: RequestSubmitTransport = async () => {
    calls += 1;
    return calls === 1
      ? reply(409, { code: "IDEMPOTENCY_CONFLICT" })
      : reply(201, { code: "REQUEST_CREATED", tracking_code: "MA-4321" });
  };
  const harness = createHarness(contactSource(null), transport);
  await harness.run();
  await harness.newAttempt();
  assert.equal(calls, 2);
  assert.equal(harness.payloads.length, 2);
  assert.notEqual(harness.payloads[0]?.submission_id, harness.payloads[1]?.submission_id);
  assert.equal(harness.state.trackingCode, "MA-4321");
});

test("38 the dedicated action after an expired id also runs exactly once", async () => {
  let calls = 0;
  const transport: RequestSubmitTransport = async () => {
    calls += 1;
    return calls === 1
      ? reply(409, { code: "IDEMPOTENCY_EXPIRED" })
      : reply(201, { code: "REQUEST_CREATED", tracking_code: "MA-5555" });
  };
  const harness = createHarness(contactSource(null), transport);
  await harness.run();
  await harness.newAttempt();
  assert.equal(calls, 2);
  assert.notEqual(harness.payloads[0]?.submission_id, harness.payloads[1]?.submission_id);
});

test("39 a double click on the dedicated action creates only one logical request", async () => {
  let calls = 0;
  const gate = deferredTransport(reply(201, { code: "REQUEST_CREATED", tracking_code: "MA-6666" }));
  const transport: RequestSubmitTransport = async (input) => {
    calls += 1;
    if (calls === 1) return reply(409, { code: "IDEMPOTENCY_CONFLICT" });
    return gate.transport(input);
  };
  const harness = createHarness(contactSource(null), transport);
  await harness.run();
  const first = harness.newAttempt();
  const second = harness.newAttempt();
  gate.release();
  await Promise.all([first, second]);
  assert.equal(calls, 2, "one conflict plus exactly one fresh attempt");
});

test("40 a normal retry keeps the same submission id", async () => {
  let calls = 0;
  const transport: RequestSubmitTransport = async () => {
    calls += 1;
    return calls === 1
      ? reply(503, { code: "TEMPORARILY_UNAVAILABLE" })
      : reply(201, { code: "REQUEST_CREATED", tracking_code: "MA-7777" });
  };
  const harness = createHarness(contactSource(null), transport);
  await harness.run();
  assert.equal(harness.state.outcome?.kind, "temporarily_unavailable");
  await harness.run();
  assert.equal(harness.payloads[0]?.submission_id, harness.payloads[1]?.submission_id);
  assert.equal(harness.state.trackingCode, "MA-7777");
});

test("41 a price confirmation keeps the same submission id", async () => {
  let calls = 0;
  const transport: RequestSubmitTransport = async () => {
    calls += 1;
    return calls === 1
      ? reply(409, {
          code: "PRICE_CHANGED",
          price: { price_type: "estimate", amount_toman: 800000 },
        })
      : reply(200, { code: "REQUEST_REPLAYED", tracking_code: "MA-8888" });
  };
  const harness = createHarness(contactSource(null), transport);
  await harness.run();
  assert.equal(harness.state.outcome?.kind, "price_changed");
  await harness.run();
  assert.equal(harness.payloads[0]?.submission_id, harness.payloads[1]?.submission_id);
});

test("42 a source change clears the idempotency block and keeps the entered values", async () => {
  let calls = 0;
  const transport: RequestSubmitTransport = async () => {
    calls += 1;
    return calls === 1
      ? reply(409, { code: "IDEMPOTENCY_CONFLICT" })
      : reply(201, { code: "REQUEST_CREATED", tracking_code: "MA-9999" });
  };
  const harness = createHarness(contactSource("pf-1001"), transport);
  await harness.run();
  assert.equal(harness.state.freshAttemptRequired, true);
  harness.setSource(contactSource("pf-2002"));
  assert.equal(harness.state.freshAttemptRequired, false);
  assert.equal(harness.state.values.customerName, VALUES.customerName);
  await harness.run();
  assert.equal(calls, 2);
  assert.notEqual(harness.payloads[0]?.submission_id, harness.payloads[1]?.submission_id);
});

test("43 the component wires the generation token and the dedicated fresh attempt", () => {
  const form = stripComments(read(FORM));
  assert.ok(form.includes("createGenerationTracker("));
  assert.ok(form.includes("const generation = generationTracker.current.observe(identity);"));
  assert.ok(form.includes("const attemptGeneration = generationTracker.current?.current()"));
  const guard = form.indexOf("if (isStaleAttempt(attemptGeneration,");
  assert.ok(guard > 0, "a generation guard must exist");
  assert.ok(form.indexOf("const result = await submitRequest(") < guard);
  assert.ok(form.indexOf("setOutcome(result)") > guard);
  assert.ok(form.includes("if (freshAttemptRequired && !allowFreshAttempt) return;"));
  assert.ok(form.includes("setFreshAttemptRequired(true)"));
  assert.ok(form.includes("void run(priceRevision, { allowFreshAttempt: true })"));
  // Only the dedicated handler may enable a fresh attempt.
  assert.equal(form.split("allowFreshAttempt: true").length - 1, 1);
});

test("44 the dedicated action guards the running fresh attempt and keeps its submission id", async () => {
  let calls = 0;
  const gate = deferredTransport(reply(503, { code: "TEMPORARILY_UNAVAILABLE" }));
  const transport: RequestSubmitTransport = async (input) => {
    calls += 1;
    if (calls === 1) return reply(409, { code: "IDEMPOTENCY_CONFLICT" });
    if (calls === 2) return gate.transport(input);
    return reply(201, { code: "REQUEST_CREATED", tracking_code: "MA-3210" });
  };
  const harness = createHarness(contactSource(null), transport);

  await harness.run();
  assert.equal(harness.state.outcome?.kind, "idempotency_conflict");
  const conflictId = harness.payloads[0]?.submission_id;

  const first = harness.newAttempt();
  const freshId = harness.submissionId();
  assert.ok(typeof freshId === "string" && freshId.length > 0);
  assert.notEqual(freshId, conflictId);

  // The second click happens while the fresh attempt is still in flight.
  await harness.newAttempt();
  assert.equal(harness.submissionId(), freshId, "the running submission id survives");
  assert.equal(harness.state.freshAttemptRequired, false);
  assert.equal(calls, 2, "one conflict plus exactly one fresh attempt");

  gate.release();
  await first;
  assert.equal(harness.state.outcome?.kind, "temporarily_unavailable");
  assert.equal(harness.payloads[1]?.submission_id, freshId);

  // A normal retry reuses the fresh submission id.
  await harness.run();
  assert.equal(calls, 3);
  assert.equal(harness.payloads[2]?.submission_id, freshId);
  assert.equal(harness.state.trackingCode, "MA-3210");
});

test("45 the dedicated handler guards in-flight work before any mutation", () => {
  const form = stripComments(read(FORM));
  const start = form.indexOf("onNewAttempt={");
  assert.ok(start > 0);
  const handler = form.slice(start, form.indexOf("}}", start));
  const guard = handler.indexOf("if (inFlight.current) return;");
  assert.ok(guard > 0, "the dedicated handler must guard in-flight attempts");
  assert.ok(guard < handler.indexOf("submissionId.current = null"));
  assert.ok(guard < handler.indexOf("setOutcome(null)"));
  assert.ok(guard < handler.indexOf("setFreshAttemptRequired(false)"));
  assert.ok(guard < handler.indexOf("run("));
  assert.equal(handler.split("run(").length - 1, 1);
  assert.ok(handler.includes("allowFreshAttempt: true"));
  assert.equal(form.split("allowFreshAttempt: true").length - 1, 1);
  assert.ok(!/setTimeout|setInterval|debounce/.test(form));
});
