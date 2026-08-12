import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { delegationErrors, routeUnit, routeUnitBody } from "@/lib/route-defs/route-test-source";

import { CUSTOM_FUNNEL_OPTION_ROLES, CUSTOM_FUNNEL_STEPS } from "../custom-funnel";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

const ROUTE = "routes/grave-stones/custom.tsx";

const ROUTE_FACTORY = "customFunnelRouteOptions";
/** fa wrapper + en wrapper + the shared factory section that owns this route. */
const routeSource = () => routeUnit(ROUTE, ROUTE_FACTORY);
/** Route unit without the shared import header, used for per-route bans. */
const routeBody = () => routeUnitBody(ROUTE, ROUTE_FACTORY);
const readUnit = (rel: string) => (rel === ROUTE ? routeSource() : read(rel));
const PAGE = "components/custom-funnel/custom-funnel-page.tsx";
const STEPPER = "components/custom-funnel/custom-funnel-stepper.tsx";
const STATES = "components/custom-funnel/custom-funnel-states.tsx";
const LOGIC = "lib/custom-funnel.ts";

const FILES = [ROUTE, PAGE, STEPPER, STATES, LOGIC];

const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const ALL = FILES.map(readUnit).join("\n");
const ALL_CODE = FILES.map((rel) => stripComments(readUnit(rel))).join("\n");

test("1 the route consumes only getProducts(), getCatalogVersion() and getSite()", () => {
  const route = routeSource();
  assert.ok(route.includes('from "@/lib/content/adapters"'));
  assert.ok(route.includes("Promise.all"));
  assert.ok(route.includes("getCatalogVersion()"));
  assert.ok(route.includes("getSite()"));
  for (const name of ["getProduct(", "getPortfolioItems", "getGuides", "getPage("]) {
    assert.ok(!routeBody().includes(name), `route must not call ${name}`);
  }
});

test('2 getProducts({ type: "simple" }) is used', () => {
  assert.ok(routeSource().includes('getProducts({ type: "simple" })'));
});

test("3 no JSON, markdown, fixture or asset import exists", () => {
  const bad = /from\s+["'][^"']*\.(json|md|mdx|png|jpe?g|svg|webp|avif|woff2?)["']/;
  assert.ok(!bad.test(ALL_CODE));
  assert.ok(!/fixture/i.test(ALL_CODE));
});

test("4 the existing route id is preserved", () => {
  assert.ok(routeSource().includes('createFileRoute("/grave-stones/custom")'));
  assert.ok(!routeSource().includes("RouteSkeleton"));
});

test("5 no new route is declared", () => {
  // One wrapper per locale, and no third route declaration.
  const occurrences = ALL.match(/createFileRoute\(/g) ?? [];
  assert.equal(occurrences.length, 2);
});

test("6 exactly one h1 with the locked heading exists", () => {
  const page = read(PAGE);
  assert.ok(page.includes("ساخت مرحله‌ای سنگ مزار"));
  assert.equal((ALL.match(/<h1/g) ?? []).length, 1);
  assert.ok(
    page.includes(
      "انتخاب‌ها در این مرحله فقط برای آماده‌سازی خلاصه سفارش است و هنوز ثبت یا ارسال نمی‌شود.",
    ),
  );
});

test("7 there are six steps in the locked order", () => {
  assert.deepEqual(
    [...CUSTOM_FUNNEL_STEPS],
    ["سنگ", "اندازه", "دوری مجاز", "قطعه کتیبه", "حکاکی", "خلاصه"],
  );
});

test("8 progress uses an ordered list", () => {
  assert.ok(read(STEPPER).includes("<ol"));
});

test('9 aria-current="step" marks the active step', () => {
  assert.ok(read(STEPPER).includes('aria-current={index === step ? "step" : undefined}'));
});

test("10 stone and size use native radio inputs", () => {
  const stepper = read(STEPPER);
  assert.ok(stepper.includes('name="custom-funnel-stone"'));
  assert.ok(stepper.includes('name="custom-funnel-size"'));
  assert.equal((stepper.match(/type="radio"/g) ?? []).length, 2);
});

test("11 stage options use native checkboxes", () => {
  assert.ok(read(STEPPER).includes('type="checkbox"'));
});

test("12 fieldset and legend are present", () => {
  const stepper = read(STEPPER);
  assert.ok(stepper.includes("<fieldset"));
  assert.ok(stepper.includes("<legend"));
});

test("13 the callback consumes the existing draft type", () => {
  const stepper = read(STEPPER);
  assert.ok(stepper.includes("onDraftReady: (draft: GraveStoneRequestDraft) => void"));
  assert.ok(stepper.includes('from "@/lib/request-draft"'));
  assert.ok(read(STEPPER).includes("تحویل خلاصه انتخاب"));
});

test("14 no api, fetch or form element exists", () => {
  for (const banned of [
    "fetch(",
    "<form",
    "onSubmit",
    "createServerFn",
    "supabase",
    "<textarea",
    'type="text"',
  ]) {
    assert.ok(!ALL_CODE.includes(banned), `must not contain ${banned}`);
  }
});

test("15 there is no navigation to another route", () => {
  for (const banned of ["useNavigate", "<Link", "redirect(", "router.navigate"]) {
    assert.ok(!ALL_CODE.includes(banned), `must not contain ${banned}`);
  }
});

test("16 search params and hash are never mutated", () => {
  for (const banned of [
    "location.hash",
    "URLSearchParams",
    "useSearch",
    "validateSearch",
    "location.search",
  ]) {
    assert.ok(!ALL_CODE.includes(banned), `must not contain ${banned}`);
  }
});

test("17 no storage or cookie is used", () => {
  for (const banned of ["localStorage", "sessionStorage", "document.cookie", "indexedDB"]) {
    assert.ok(!ALL_CODE.includes(banned), `must not contain ${banned}`);
  }
});

test("18 history state carries the step index only", () => {
  const stepper = read(STEPPER);
  assert.ok(stepper.includes("HISTORY_STEP_KEY"));
  assert.ok(stepper.includes("pushState"));
  assert.ok(stepper.includes("replaceState"));
  const writes = stepper.match(/\[HISTORY_STEP_KEY\]: [a-z0-9]+/g) ?? [];
  assert.equal(writes.length, 2);
});

test("19 no selection value is written into history state", () => {
  const stepper = read(STEPPER);
  const stateWrites = stepper.match(/(push|replace)State\([\s\S]{0,160}?\)/g) ?? [];
  assert.equal(stateWrites.length, 2);
  for (const write of stateWrites) {
    for (const banned of [
      "selection",
      "draft",
      "variantId",
      "optionId",
      "catalogVersion",
      "price",
    ]) {
      assert.ok(!write.includes(banned), `history state must not contain ${banned}`);
    }
  }
});

test("20 the popstate listener is cleaned up", () => {
  const stepper = read(STEPPER);
  assert.ok(stepper.includes('addEventListener("popstate"'));
  assert.ok(stepper.includes('removeEventListener("popstate"'));
});

test("21 reload detection is SSR-safe", () => {
  const page = read(PAGE);
  assert.ok(page.includes('typeof window === "undefined"'));
  assert.ok(page.includes('getEntriesByType("navigation")'));
  assert.ok(page.includes('entry?.type === "reload"'));
  assert.ok(read(STEPPER).includes('typeof window === "undefined"'));
});

test("22 the exact cascade announcement is present and polite", () => {
  const stepper = read(STEPPER);
  assert.ok(stepper.includes("انتخاب‌های مراحل بعدی به‌دلیل تغییر این مرحله پاک شد."));
  assert.ok(stepper.includes('role="status"'));
  assert.ok(stepper.includes('aria-live="polite"'));
});

test("23 the exact reload announcement is present", () => {
  assert.ok(read(PAGE).includes("انتخاب‌های قبلی ذخیره نشده‌اند و مسیر از مرحلهٔ اول آغاز شد."));
});

test("24 the exact empty state text is present", () => {
  assert.ok(read(STATES).includes("در حال حاضر گزینهٔ کاملی برای ساخت مرحله‌ای ثبت نشده است."));
  assert.ok(read(PAGE).includes("CustomFunnelEmpty"));
});

test("25 loading and error states are accessible", () => {
  const states = read(STATES);
  assert.ok(states.includes('aria-busy="true"'));
  assert.ok(states.includes("در حال دریافت گزینه‌های ساخت مرحله‌ای"));
  assert.ok(states.includes('role="alert"'));
  assert.ok(states.includes("دریافت گزینه‌های ساخت مرحله‌ای ممکن نشد."));
  assert.ok(states.includes("تلاش دوباره"));
  assert.ok(states.includes("router.invalidate()"));
  assert.ok(!/animate-|spinner|shimmer/i.test(states));
});

test("26 the existing ProductDraftSummary is consumed unchanged", () => {
  assert.ok(read(STEPPER).includes("ProductDraftSummary"));
  const summary = read("components/product/product-draft-summary.tsx");
  assert.ok(summary.includes("export function ProductDraftSummary"));
});

test("27 product detail and request draft modules are only imported", () => {
  assert.ok(read(LOGIC).includes('from "./product-detail"'));
  assert.ok(read(LOGIC).includes('from "./request-draft"'));
  assert.ok(read(LOGIC).includes("buildGraveStoneRequestDraft"));
  assert.ok(read("lib/request-draft.ts").includes("export function buildGraveStoneRequestDraft"));
});

test("28 roles are never inferred from titles or id patterns", () => {
  const logic = stripComments(read(LOGIC));
  for (const banned of ["startsWith(", 'includes("dori', "toLowerCase()", "match(", "RegExp"]) {
    assert.ok(!logic.includes(banned), `role classification must not use ${banned}`);
  }
  assert.ok(logic.includes("makeCustomOptionRoleKey"));
});

test("29 the runtime registry is empty", () => {
  assert.deepEqual(CUSTOM_FUNNEL_OPTION_ROLES, {});
  assert.ok(read(LOGIC).includes("CUSTOM_FUNNEL_OPTION_ROLES: CustomOptionRoleRegistry = {}"));
});

test("30 no test fixture leaks into runtime files", () => {
  for (const banned of ["MA-1001", "o-1", "opt-", "sang-"]) {
    assert.ok(!ALL_CODE.includes(banned), `runtime must not contain ${banned}`);
  }
});

test("31 cnc is excluded from the funnel", () => {
  const logic = read(LOGIC);
  assert.ok(logic.includes('product.type !== "simple"'));
  assert.ok(!read(STEPPER).includes("cnc_box"));
});

test("32 the dori rule is exactly 160x60 and 180x60", () => {
  const logic = read(LOGIC);
  assert.ok(
    logic.includes('DORI_SIZE_CODES: readonly GraveStoneSizeCode[] = ["160x60", "180x60"]'),
  );
  assert.ok(logic.includes("DORI_SIZE_CODES.includes(variant.sizeCode)"));
});

test("33 no parallel price resolver exists", () => {
  assert.ok(!/function\s+\w*[Rr]esolve\w*Price/.test(ALL_CODE));
  assert.ok(!ALL_CODE.includes("amountToman +"));
});

test("34 no raw colors or banned effects are used", () => {
  const banned =
    /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|gradient|backdrop-blur|blur-|bg-white|bg-black|text-white|text-black|glass|animate-|shimmer/;
  assert.ok(!banned.test(ALL_CODE));
});

test("35 the 4/8/12 grid is present", () => {
  assert.ok(read(PAGE).includes("grid-cols-4"));
  assert.ok(read(PAGE).includes("md:grid-cols-8"));
  assert.ok(read(PAGE).includes("lg:grid-cols-12"));
});

test("36 the desktop 3/9 split is present", () => {
  const stepper = read(STEPPER);
  assert.ok(stepper.includes("lg:col-span-3"));
  assert.ok(stepper.includes("lg:col-span-9"));
});

test("37 touch targets and focus-visible are present", () => {
  const stepper = read(STEPPER);
  assert.ok(stepper.includes("min-h-11"));
  assert.ok(stepper.includes("focus-visible:outline-2"));
});

test("38 the draft is kept in React memory only", () => {
  const page = read(PAGE);
  assert.ok(page.includes("useState<GraveStoneRequestDraft | null>(null)"));
  assert.ok(page.includes("خلاصه انتخاب آماده است؛ ثبت سفارش در این مرحله انجام نشده است."));
});

test("39 no success or tracking code exists", () => {
  for (const banned of ["MA-", "REQUEST_CREATED", "REQUEST_REPLAYED", "tracking", "Tracking"]) {
    assert.ok(!ALL_CODE.includes(banned), `must not contain ${banned}`);
  }
});

test("40 routeTree.gen is never imported at runtime", () => {
  assert.ok(!ALL_CODE.includes("routeTree"));
});

test("41 the page passes onDraftInvalidated wired to setDraft(null)", () => {
  const page = read(PAGE);
  assert.ok(page.includes("onDraftInvalidated={() => setDraft(null)}"));
  assert.ok(page.includes("onDraftReady={(next) => setDraft(next)}"));
});

test("42 the stepper declares the exact invalidation prop type", () => {
  const stepper = read(STEPPER);
  assert.ok(stepper.includes("onDraftInvalidated: () => void;"));
  assert.ok(/onDraftInvalidated,\s/.test(stepper));
});

test("43 apply checks reduction.changed first and returns early", () => {
  const stepper = read(STEPPER);
  const apply = stepper.slice(stepper.indexOf("const apply ="));
  const body = apply.slice(0, apply.indexOf("};") + 2);
  const guard = body.indexOf("if (!reduction.changed) return;");
  const invalidate = body.indexOf("onDraftInvalidated()");
  const setSelection = body.indexOf("setSelection(reduction.selection)");
  assert.ok(guard >= 0);
  assert.ok(invalidate > guard);
  assert.ok(setSelection > invalidate);
});

test("44 draft invalidation does not depend on clearedDownstream", () => {
  const stepper = read(STEPPER);
  const apply = stepper.slice(stepper.indexOf("const apply ="));
  const body = apply.slice(0, apply.indexOf("};") + 2);
  assert.ok(!/clearedDownstream[\s\S]{0,80}onDraftInvalidated/.test(body));
  assert.ok(body.indexOf("onDraftInvalidated()") < body.indexOf("clearedDownstream"));
});

test("45 invalidation is called from exactly one place", () => {
  const stepper = read(STEPPER);
  assert.equal((stepper.match(/onDraftInvalidated\(\)/g) ?? []).length, 1);
});

test("46 navigation and history paths never invalidate the draft", () => {
  const stepper = stripComments(read(STEPPER));
  const goToStep = stepper.slice(stepper.indexOf("const goToStep ="));
  const goToStepBody = goToStep.slice(0, goToStep.indexOf("}, []);"));
  assert.ok(!goToStepBody.includes("onDraftInvalidated"));
  const effect = stepper.slice(stepper.indexOf("const onPopState"));
  const effectBody = effect.slice(0, effect.indexOf("}, []);"));
  assert.ok(!effectBody.includes("onDraftInvalidated"));
  for (const fragment of stepper.match(/(push|replace)State\([\s\S]{0,160}?\)/g) ?? []) {
    assert.ok(!fragment.includes("onDraftInvalidated"));
  }
});

test("47 ProductPricePanel is absent from the custom funnel", () => {
  assert.ok(!ALL.includes("ProductPricePanel"));
  assert.ok(!ALL.includes("product-price-panel"));
});

test("48 the summary consumes only the draft summary component", () => {
  const stepper = read(STEPPER);
  assert.ok(stepper.includes("{draft ? <ProductDraftSummary draft={draft} /> : null}"));
  for (const banned of ["variant={", "includes.length", "excludes.length"]) {
    assert.ok(!stepper.includes(banned), `summary must not use ${banned}`);
  }
});

test("49 no unused price state remains in the stepper", () => {
  const stepper = read(STEPPER);
  assert.ok(!stepper.includes("resolveSelectionPrice"));
  assert.ok(!stepper.includes("selectedOptions"));
  assert.ok(!/const price =/.test(stepper));
});

test("50 option-row pricing helpers are preserved", () => {
  const stepper = read(STEPPER);
  for (const helper of ["formatOptionPriceLabel", "formatPriceDate"]) {
    assert.ok(stepper.includes(helper), `must keep ${helper}`);
  }
  assert.ok(stepper.includes("formatOptionPriceLabel(option, locale)"));
});

test("51 no form, network, storage, cookie or PII surface is added", () => {
  for (const banned of [
    "fetch(",
    "localStorage",
    "sessionStorage",
    "document.cookie",
    "<form",
    "useNavigate",
    "phone",
    "mobile",
  ]) {
    assert.ok(!ALL_CODE.includes(banned), `must not contain ${banned}`);
  }
});

test("fa and en wrappers declare their route ids and delegate to the shared factory", () => {
  assert.deepEqual(
    delegationErrors({
      rel: ROUTE,
      faRouteId: "/grave-stones/custom",
      enRouteId: "/en/grave-stones/custom",
      exportName: ROUTE_FACTORY,
    }),
    [],
  );
});
