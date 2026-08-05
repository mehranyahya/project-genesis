import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

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
  assert.ok(branch.includes("submissionId.current = null"));
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
  assert.ok(handler.includes("void run(priceRevision)"));
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
