import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { delegationErrors, routeUnit, routeUnitBody } from "@/lib/route-defs/route-test-source";

import {
  EMPTY_REQUEST_FORM_VALUES,
  buildRequestPayload,
  validateRequestForm,
} from "../request-form";
import type { RequestFormValues, RequestSource } from "../request-form";
import { BUILDING_STONE_FIELD_ERRORS, EMPTY_BUILDING_STONE_VALUES } from "../building-stone";
import type { BuildingStoneValues } from "../building-stone";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

const ROUTE = "routes/building-stone.tsx";

const ROUTE_FACTORY = "buildingStoneRouteOptions";
/** fa wrapper + en wrapper + the shared factory section that owns this route. */
const routeSource = () => routeUnit(ROUTE, ROUTE_FACTORY);
/** Route unit without the shared import header, used for per-route bans. */
const routeBody = () => routeUnitBody(ROUTE, ROUTE_FACTORY);
const readUnit = (rel: string) => (rel === ROUTE ? routeSource() : read(rel));
const PAGE = "components/building-stone/building-stone-page.tsx";
const FIELDS = "components/building-stone/building-stone-fields.tsx";
const SUMMARY = "components/building-stone/building-stone-summary.tsx";
const FORM = "components/request-form/request-form.tsx";

const COMPONENTS = [PAGE, FIELDS, SUMMARY];
const FILES = [ROUTE, ...COMPONENTS];
const ALL = FILES.map(readUnit).join("\n");

const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const ALL_CODE = FILES.map((rel) => stripComments(readUnit(rel))).join("\n");

const HASH = "a".repeat(64);
const TERMS = { version: "1.0.0", contentHash: HASH };

const selection = (over: Partial<BuildingStoneValues> = {}): BuildingStoneValues => ({
  ...EMPTY_BUILDING_STONE_VALUES,
  stoneType: "granite",
  application: "flooring",
  areaM2Input: "۱۲۰",
  ...over,
});

const source = (over: Partial<BuildingStoneValues> = {}): RequestSource => ({
  kind: "building_stone",
  selection: selection(over),
});

const filled = (over: Partial<RequestFormValues> = {}): RequestFormValues => ({
  ...EMPTY_REQUEST_FORM_VALUES,
  customerName: "علی رضایی",
  phone: "09121234567",
  preferredContact: "phone",
  termsAccepted: true,
  ...over,
});

/* -------------------------------------------------------------------------- */
/* Route and page surface                                                      */
/* -------------------------------------------------------------------------- */

test("1 the route is the real business route and reads only getSite()", () => {
  const route = routeSource();
  assert.ok(route.includes('createFileRoute("/building-stone")'));
  assert.ok(route.includes("getSite()"));
  for (const name of ["getProducts", "getProduct(", "getGuides", "getGuide(", "getPage"]) {
    assert.ok(!routeBody().includes(name), `route must not call ${name}`);
  }
});

test("2 exactly one H1 with the official heading and intro", () => {
  assert.equal(ALL.split("<h1").length - 1, 1);
  const page = read(PAGE);
  assert.ok(page.includes("درخواست بررسی سنگ ساختمانی"));
  assert.ok(page.includes("BUILDING_STONE_INTRO"));
});

test("3 no JSON, markdown, fixture or asset import exists", () => {
  const bad = /from\s+["'][^"']*\.(json|md|mdx|png|jpe?g|svg|webp|avif|woff2?)["']/;
  assert.ok(!bad.test(ALL_CODE));
  assert.ok(!/fixture/i.test(ALL_CODE));
});

/* -------------------------------------------------------------------------- */
/* Shared-form rendering                                                       */
/* -------------------------------------------------------------------------- */

test("4 the fields render inside the shared form, with no nested form and no own submit", () => {
  const page = read(PAGE);
  assert.ok(page.includes("<RequestForm"));
  assert.ok(page.includes("renderExtensionFields"));
  const fields = read(FIELDS);
  assert.ok(!fields.includes("<form"));
  assert.ok(!fields.includes('type="submit"'));
  assert.ok(!read(SUMMARY).includes("<form"));
});

test("5 the extension slot is rendered before the shared contact fields", () => {
  const form = stripComments(read(FORM));
  const slot = form.indexOf("renderExtensionFields({");
  const contact = form.indexOf("<RequestFormFields");
  assert.ok(slot > 0 && contact > 0 && slot < contact);
});

test("6 extension fields are disabled while the form submits", () => {
  assert.ok(read(FORM).includes("disabled: submitting"));
  assert.ok(read(FIELDS).includes("disabled={disabled}"));
});

test("7 every extension error is accessible and non-color-coded", () => {
  const fields = read(FIELDS);
  assert.ok(fields.includes('role="alert"'));
  assert.ok(fields.includes("aria-errormessage"));
  assert.ok(fields.includes("aria-invalid"));
  assert.ok(fields.includes('{t("خطا")}: '));
});

test("8 the building-stone error is focused before the general field errors", () => {
  const form = stripComments(read(FORM));
  const extension = form.indexOf("firstInvalidExtensionField");
  const general = form.indexOf("validation.firstInvalidField");
  assert.ok(extension > 0 && general > 0 && extension < general);
  assert.ok(form.includes("buildingStoneFieldId("));
});

test("9 controls keep a 44px target and a visible focus ring", () => {
  const fields = read(FIELDS);
  assert.ok(fields.includes("min-h-11"));
  assert.ok(fields.includes("focus-visible:outline-2"));
  assert.ok(fields.includes("focus-visible:outline-focus"));
});

test("10 selection uses native radio controls only", () => {
  const fields = read(FIELDS);
  assert.ok(fields.includes('type="radio"'));
  assert.ok(!fields.includes('role="radiogroup"'));
  assert.ok(fields.includes("<fieldset"));
  assert.ok(fields.includes("<legend"));
});

/* -------------------------------------------------------------------------- */
/* Validation through the shared form                                          */
/* -------------------------------------------------------------------------- */

test("11 an incomplete selection blocks the shared validation", () => {
  const result = validateRequestForm({
    values: filled(),
    source: { kind: "building_stone", selection: EMPTY_BUILDING_STONE_VALUES },
  });
  assert.equal(result.valid, false);
  assert.equal(result.extensionErrors["stoneType"], BUILDING_STONE_FIELD_ERRORS.stoneType);
  assert.equal(result.firstInvalidExtensionField, "stoneType");
});

test("12 a complete selection passes and city and location stay optional", () => {
  const result = validateRequestForm({ values: filled(), source: source() });
  assert.equal(result.valid, true);
  assert.equal(result.firstInvalidExtensionField, null);
  assert.equal(result.fields?.city, null);
});

test("13 the other application requires the shared note", () => {
  const missing = validateRequestForm({
    values: filled(),
    source: source({ application: "other" }),
  });
  assert.equal(missing.valid, false);
  assert.equal(missing.errors.customerNote, BUILDING_STONE_FIELD_ERRORS.otherNote);

  const provided = validateRequestForm({
    values: filled({ customerNote: "اجرای ازارهٔ سنگی راه‌پله" }),
    source: source({ application: "other" }),
  });
  assert.equal(provided.valid, true);
});

/* -------------------------------------------------------------------------- */
/* Payload                                                                     */
/* -------------------------------------------------------------------------- */

test("14 the payload is a building_stone review request with a null amount", () => {
  const payload = buildRequestPayload({
    submissionId: "sid-1",
    source: source(),
    values: filled(),
    termsDocument: TERMS,
  });
  assert.ok(payload !== null);
  assert.equal(payload.request_type, "building_stone");
  if (payload.request_type !== "building_stone") throw new Error("unreachable");
  assert.equal(payload.stone_type, "granite");
  assert.equal(payload.application, "flooring");
  assert.equal(payload.area_m2, 120);
  assert.equal(payload.client_price_type, "review");
  assert.equal(payload.client_displayed_price, null);
});

test("15 an absent area is sent as null and never estimated", () => {
  const payload = buildRequestPayload({
    submissionId: "sid-1",
    source: source({ areaM2Input: "" }),
    values: filled(),
    termsDocument: TERMS,
  });
  assert.ok(payload !== null && payload.request_type === "building_stone");
  assert.equal(payload.area_m2, null);
  assert.ok(!JSON.stringify(payload).includes("area_estimate"));
});

test("16 an invalid selection or missing other note blocks the payload entirely", () => {
  assert.equal(
    buildRequestPayload({
      submissionId: "sid-1",
      source: { kind: "building_stone", selection: EMPTY_BUILDING_STONE_VALUES },
      values: filled(),
      termsDocument: TERMS,
    }),
    null,
  );
  assert.equal(
    buildRequestPayload({
      submissionId: "sid-1",
      source: source({ application: "other" }),
      values: filled(),
      termsDocument: TERMS,
    }),
    null,
  );
});

/* -------------------------------------------------------------------------- */
/* Privacy                                                                     */
/* -------------------------------------------------------------------------- */

test("17 the other description travels once, only in customer_note", () => {
  const payload = buildRequestPayload({
    submissionId: "sid-1",
    source: source({ application: "other" }),
    values: filled({ customerNote: "اجرای ازارهٔ سنگی راه‌پله" }),
    termsDocument: TERMS,
  });
  assert.ok(payload !== null && payload.request_type === "building_stone");
  assert.equal(payload.customer_note, "اجرای ازارهٔ سنگی راه‌پله");
  const serialized = JSON.stringify(payload);
  assert.equal(serialized.split("اجرای ازارهٔ سنگی راه‌پله").length - 1, 1);
});

test("18 no personal data reaches the URL, storage, logs or the summary", () => {
  for (const bad of [
    "localStorage",
    "sessionStorage",
    "document.cookie",
    "console.log",
    "URLSearchParams",
    "?name=",
    "customerName",
    "phone",
  ]) {
    assert.ok(!ALL_CODE.includes(bad), `building-stone surface must not use ${bad}`);
  }
});

test("19 the summary shows only the non-personal selection", () => {
  const summary = read(SUMMARY);
  assert.ok(summary.includes("buildBuildingStoneSummary"));
  assert.ok(!summary.includes("customerNote"));
  assert.ok(!summary.includes("Price"));
  assert.ok(!summary.includes("تومان"));
});

/* -------------------------------------------------------------------------- */
/* Design and regression                                                       */
/* -------------------------------------------------------------------------- */

test("20 no raw colors and no banned visual effect", () => {
  const banned = [
    /#[0-9a-fA-F]{3,8}\b/,
    /\bbg-(white|black|slate|gray|zinc|red|blue|green|amber|yellow)-/,
    /\btext-(white|black|slate|gray|zinc|red|blue|green|amber|yellow)-/,
    /gradient/,
    /backdrop-(blur|filter)/,
    /\bblur-/,
    /\bshadow-(lg|xl|2xl)/,
    /\brounded-/,
    /\banimate-/,
  ];
  for (const pattern of banned) {
    assert.ok(!pattern.test(ALL_CODE), `banned pattern ${String(pattern)}`);
  }
});

test("21 the grid follows the official 4/8/12 columns", () => {
  const page = read(PAGE);
  assert.ok(page.includes("grid-cols-4"));
  assert.ok(page.includes("md:grid-cols-8"));
  assert.ok(page.includes("lg:grid-cols-12"));
});

test("22 no backend, secret or generated route-tree surface exists", () => {
  for (const bad of ["supabase", "https://", "process.env", "routeTree.gen", "fetch("]) {
    assert.ok(!ALL_CODE.includes(bad), `building-stone surface must not reference ${bad}`);
  }
});

test("23 the shared grave-stone and contact contracts are unchanged", () => {
  const grave = validateRequestForm({
    values: filled({ city: "تهران", locationText: "بهشت زهرا" }),
    source: {
      kind: "contact",
      portfolioReferenceId: "pf-1001",
    },
  });
  assert.equal(grave.valid, true);
  assert.deepEqual(grave.extensionErrors, {});
  assert.equal(grave.firstInvalidExtensionField, null);
});

/* -------------------------------------------------------------------------- */
/* Real extension binding                                                      */
/* -------------------------------------------------------------------------- */

test("24 the page binds the official extension contract, not a local copy", () => {
  const page = stripComments(read(PAGE));
  assert.ok(page.includes("buildingStoneExtension"));
  assert.ok(page.includes("contract: buildingStoneExtension"));
  assert.ok(page.includes('kind: "building_stone"'));
  assert.ok(page.includes("fieldId: buildingStoneFieldId"));
  assert.ok(page.includes("extension={binding}"));
  // No parallel validation, payload, price or submission logic on the page.
  for (const bad of [
    "validateBuildingStoneSelection",
    "buildBuildingStonePayloadFields",
    "client_price_type",
    "submitRequest",
    "normalizeAreaM2",
  ]) {
    assert.ok(!page.includes(bad), `the page must not re-implement ${bad}`);
  }
});

test("25 the shared form consumes the bound contract and never a hard-coded one", () => {
  const form = stripComments(read(FORM));
  assert.ok(form.includes("extension.contract?.kind === source.kind"));
  assert.ok(form.includes("const contract = binding === null ? null : binding.contract;"));
  assert.ok(form.includes("validateRequestForm({ values, source, extension: contract })"));
  assert.ok(form.includes("extension: contract"));
  // The building model is reached only through the contract and the field id.
  assert.ok(!form.includes("validateBuildingStoneSelection"));
  assert.ok(!form.includes("buildBuildingStonePayloadFields"));
});

test("26 the extension public API uses neither any nor a bypassing unknown cast", () => {
  for (const rel of ["lib/building-stone.ts", "lib/request-form.ts", FORM, PAGE]) {
    const code = stripComments(read(rel));
    assert.ok(!/:\s*any\b/.test(code), `${rel} must not annotate any`);
    assert.ok(!/\bas\s+any\b/.test(code), `${rel} must not cast to any`);
    assert.ok(!/\bas\s+unknown\s+as\b/.test(code), `${rel} must not double-cast`);
  }
});

test("27 a mismatched binding produces no payload from the page contract", () => {
  const page = stripComments(read(PAGE));
  // The page can only pass a building binding for a building source.
  assert.ok(page.includes("BuildingStoneFormBinding"));
  assert.equal(page.split("<RequestForm").length - 1, 1);
  assert.equal(
    buildRequestPayload({
      submissionId: "sid-1",
      source: source(),
      values: filled(),
      termsDocument: TERMS,
      extension: null,
    }),
    null,
  );
});

test("28 the area field accepts the official representations through the shared payload", () => {
  const areaOf = (areaM2Input: string) => {
    const payload = buildRequestPayload({
      submissionId: "sid-1",
      source: source({ areaM2Input }),
      values: filled(),
      termsDocument: TERMS,
    });
    return payload !== null && payload.request_type === "building_stone"
      ? payload.area_m2
      : "blocked";
  };
  assert.equal(areaOf("1,000"), 1000);
  assert.equal(areaOf("۱\u066c۰۰۰"), 1000);
  assert.equal(areaOf("12.5"), 12.5);
  assert.equal(areaOf(" 120"), "blocked");
  assert.equal(areaOf("120 "), "blocked");
  assert.equal(areaOf("1,2"), "blocked");
});

test("29 the focus contract is committed, never applied inline", () => {
  const form = stripComments(read(FORM));
  assert.ok(
    form.includes("setPendingFocusId(resolvePendingFocusId(validation, extensionFieldId))"),
  );
  assert.ok(form.includes("}, [pendingFocusId]);"));
  assert.ok(!form.includes("focusById("));
  assert.equal(form.split(".focus();").length - 1, 1);
});

test("fa and en wrappers declare their route ids and delegate to the shared factory", () => {
  assert.deepEqual(
    delegationErrors({
      rel: ROUTE,
      faRouteId: "/building-stone",
      enRouteId: "/en/building-stone",
      exportName: ROUTE_FACTORY,
    }),
    [],
  );
});
