import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

const ROUTE = "routes/grave-stones/$slug.tsx";
const PAGE = "components/product/product-detail-page.tsx";
const STAGE = "components/product/product-media-stage.tsx";
const SELECTION = "components/product/product-selection.tsx";
const PRICE = "components/product/product-price-panel.tsx";
const SUMMARY = "components/product/product-draft-summary.tsx";
const STATES = "components/product/product-detail-states.tsx";
const MODEL = "lib/product-detail.ts";
const DRAFT = "lib/request-draft.ts";

const FILES = [ROUTE, PAGE, STAGE, SELECTION, PRICE, SUMMARY, STATES, MODEL, DRAFT];

const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const ALL = FILES.map(read).join("\n");
const ALL_CODE = FILES.map((rel) => stripComments(read(rel))).join("\n");

test("1 the route consumes only getProduct() and getCatalogVersion()", () => {
  const route = read(ROUTE);
  assert.ok(route.includes('from "@/lib/content/adapters"'));
  assert.ok(route.includes("getProduct(params.slug)"));
  assert.ok(route.includes("getCatalogVersion()"));
  assert.ok(route.includes("Promise.all"));
  for (const name of ["getProducts(", "getPortfolioItems", "getGuides", "getSite", "getPage("]) {
    assert.ok(!route.includes(name), `route must not call ${name}`);
  }
});

test("2 no direct JSON, markdown, fixture or asset import exists", () => {
  const bad = /from\s+["'][^"']*\.(json|md|mdx|png|jpe?g|svg|webp|avif|woff2?)["']/;
  assert.ok(!bad.test(ALL_CODE));
  assert.ok(!/fixture/i.test(ALL_CODE));
});

test("3 the official notFound() is used for invalid products", () => {
  const route = read(ROUTE);
  assert.ok(route.includes('notFound } from "@tanstack/react-router"'));
  assert.ok(route.includes("throw notFound()"));
  assert.ok(route.includes("buildProductDetailModel"));
});

test("4 no local notFoundComponent is declared", () => {
  assert.ok(!ALL_CODE.includes("notFoundComponent"));
});

test("5 pending and error components are real and wired", () => {
  const route = read(ROUTE);
  assert.ok(route.includes("pendingComponent: ProductDetailLoading"));
  assert.ok(route.includes("errorComponent: ProductDetailError"));
  assert.ok(!route.includes("RouteSkeleton"));
});

test("6 no error message or stack reaches the UI", () => {
  assert.ok(!/error\.(message|stack)/.test(ALL_CODE));
});

test("7 exactly one H1 exists in the route surface", () => {
  assert.equal(ALL.split("<h1").length - 1, 1);
  assert.ok(read(PAGE).includes("<h1"));
});

test("8 the media stage uses the exact 4:5 ratio", () => {
  assert.ok(read(STAGE).includes("aspect-[4/5]"));
  assert.ok(read(STATES).includes("aspect-[4/5]"));
});

test("9 the stage exists only in product components", () => {
  assert.ok(!read("components/grave-stones/grave-stone-card.tsx").includes("aspect-["));
  assert.ok(!read("components/grave-stones/grave-stone-list-page.tsx").includes("aspect-["));
});

test("10 the Prompt 04 list card is untouched", () => {
  const card = read("components/grave-stones/grave-stone-card.tsx");
  assert.ok(card.includes("مشاهده و انتخاب"));
  assert.ok(!card.includes("bg-surface-media"));
  assert.ok(!/<img|mediaKey|aspect-\[/.test(card));
});

test("11 no image element and no media URL resolver exist", () => {
  assert.ok(!/<img\b/i.test(ALL_CODE));
  assert.ok(!/background-image|backgroundImage|url\(|srcSet|\bsrc=/.test(ALL_CODE));
});

test("12 mediaKey never appears in the UI layer", () => {
  for (const rel of [PAGE, STAGE, SELECTION, PRICE, SUMMARY, STATES, ROUTE, DRAFT]) {
    assert.ok(!read(rel).includes("mediaKey"), `mediaKey leaked into ${rel}`);
  }
  assert.equal(stripComments(read(MODEL)).includes("media.mediaKey"), false);
});

test("13 gallery controls and a polite live position are present", () => {
  const stage = read(STAGE);
  assert.ok(stage.includes("رسانه قبلی"));
  assert.ok(stage.includes("رسانه بعدی"));
  assert.ok(stage.includes('aria-live="polite"'));
  assert.ok(stage.includes("total > 1"));
  assert.ok(stage.includes('Intl.NumberFormat("fa-IR")'));
});

test("14 gallery surfaces are solid and unanimated", () => {
  const stage = read(STAGE);
  assert.ok(stage.includes("bg-surface"));
  const stageCode = stage.replace(/disabled:opacity-45/g, "");
  assert.ok(!/opacity-\d|\/\d0\b|absolute|animate-|autoplay|carousel|embla/i.test(stageCode));
});

test("15 the locked M5 size order is reused, not redefined", () => {
  const model = read(MODEL);
  assert.ok(model.includes('GRAVE_STONE_SIZE_ORDER } from "./grave-stone-list"'));
  assert.ok(model.includes("PRODUCT_SIZE_ORDER = GRAVE_STONE_SIZE_ORDER"));
  const list = read("lib/grave-stone-list.ts");
  assert.ok(
    list.includes('["120x60", "160x60", "180x60", "custom"] as const'),
    "Prompt 04 size order must stay unchanged",
  );
});

test("16 the variant fieldset and legend are present", () => {
  const selection = read(SELECTION);
  assert.ok(selection.includes("<fieldset"));
  assert.ok(selection.includes("انتخاب سنگ و اندازه"));
});

test("17 the option fieldset and legend are present and conditional", () => {
  const selection = read(SELECTION);
  assert.ok(selection.includes("گزینه‌های تکمیلی"));
  assert.ok(selection.includes("selectedVariant.options.length > 0"));
  assert.equal(selection.split("<legend").length - 1, 2);
});

test("18 native radio and checkbox controls are used", () => {
  const selection = read(SELECTION);
  assert.ok(selection.includes('type="radio"'));
  assert.ok(selection.includes('type="checkbox"'));
  assert.equal(selection.split("htmlFor=").length - 1, 2);
  assert.ok(!/@radix-ui|Select\b|Combobox/.test(selection));
});

test("19 fixed, estimate and review labels are exact", () => {
  const model = read(MODEL);
  assert.ok(model.includes('fixed: "قیمت"'));
  assert.ok(model.includes('estimate: "برآورد"'));
  assert.ok(model.includes('review: "نیازمند بررسی"'));
  assert.ok(model.includes("برآورد: ${"));
});

test("20 the currency note is visible beside the price panel", () => {
  assert.ok(read(MODEL).includes("همهٔ مبالغ به تومان است."));
  assert.ok(read(PRICE).includes("CURRENCY_NOTE"));
});

test("21 the exact price date label is used with a fa-IR long format", () => {
  const model = read(MODEL);
  assert.ok(model.includes("آخرین به‌روزرسانی قیمت:"));
  assert.ok(model.includes('Intl.DateTimeFormat("fa-IR", { dateStyle: "long", timeZone: "UTC" })'));
  assert.ok(read(PRICE).includes("PRICE_DATE_LABEL"));
});

test("22 product.updatedAt is never consumed as a price date", () => {
  assert.ok(!/product\.updatedAt|\bupdatedAt\b(?!\s*:)/.test(stripComments(read(MODEL))));
  assert.ok(!read(PRICE).includes("updatedAt") || read(PRICE).includes("priceUpdatedAt"));
  assert.ok(!/(?<!price)UpdatedAt/.test(read(PRICE)));
});

test("23 includes and excludes render as semantic lists", () => {
  const price = read(PRICE);
  assert.ok(price.includes("شامل نمی‌شود"));
  assert.ok(price.includes(">شامل<") || price.includes("{INCLUDES_HEADING}"));
  assert.equal(price.split("<ul").length - 1, 2);
  assert.ok(price.includes("variant.includes.length > 0"));
  assert.ok(price.includes("variant.excludes.length > 0"));
});

test("24 the review button triggers neither an API call nor navigation", () => {
  const page = read(PAGE);
  assert.ok(page.includes("بازبینی انتخاب"));
  assert.ok(
    !/fetch\(|axios|useNavigate|navigate\(|<Link|router\.navigate|createServerFn/.test(page),
  );
});

test("25 no form element exists", () => {
  assert.ok(!/<form\b/i.test(ALL_CODE));
});

test("26 no submit control or submission handler exists", () => {
  assert.ok(!/type="submit"|onSubmit|handleSubmit/.test(ALL_CODE));
});

test("27 no storage or cookie access exists", () => {
  assert.ok(
    !/localStorage|sessionStorage|document\.cookie|searchParams|window\.location/.test(ALL_CODE),
  );
});

test("28 no PII input field exists", () => {
  assert.ok(!/type="(text|tel|email)"|textarea|placeholder=/i.test(ALL_CODE));
});

test("29 no tracking code is produced", () => {
  assert.ok(!/MA-\[|trackingCode|REQUEST_CREATED|idempotenc/i.test(ALL_CODE));
});

test("30 zero raw colors and zero banned effects in the new files", () => {
  const rawColor = /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(/;
  const banned =
    /gradient|backdrop-filter|backdrop-blur|blur\(|animate-|shimmer|spinner|mix-blend|grayscale|sepia|brightness-|shadow-(lg|xl|2xl)/i;
  for (const rel of FILES) {
    const code = stripComments(read(rel));
    assert.ok(!rawColor.test(code), `raw color in ${rel}`);
    assert.ok(!banned.test(code), `banned effect in ${rel}`);
  }
});

test("31 the 4/8/12 grid and the seven/five desktop split are present", () => {
  const page = read(PAGE);
  assert.ok(page.includes("grid-cols-4"));
  assert.ok(page.includes("md:grid-cols-8"));
  assert.ok(page.includes("lg:grid-cols-12"));
  assert.ok(page.includes("lg:col-span-7"));
  assert.ok(page.includes("lg:col-span-5"));
});

test("32 touch targets and focus-visible rings are present on controls", () => {
  for (const rel of [PAGE, STAGE, STATES]) {
    assert.ok(read(rel).includes("min-h-11"), `min-h-11 missing in ${rel}`);
    assert.ok(read(rel).includes("focus-visible:outline-2"), `focus ring missing in ${rel}`);
  }
  assert.ok(read(SELECTION).includes("min-h-11"));
  assert.ok(read(SELECTION).includes("focus-visible:outline-2"));
});

test("33 latin stone and product codes are isolated with bdi", () => {
  assert.ok(read(PAGE).includes('<bdi dir="ltr">{model.code}</bdi>'));
  assert.ok(read(SELECTION).includes('<bdi dir="ltr">{variant.stoneCode}</bdi>'));
  assert.ok(read(SUMMARY).includes('<bdi dir="ltr">'));
  assert.ok(!read(PAGE).includes("model.slug"));
});

test("34 loading and error states are accessible with exact copy", () => {
  const states = read(STATES);
  assert.ok(states.includes('aria-busy="true"'));
  assert.ok(states.includes("در حال دریافت جزئیات سنگ مزار"));
  assert.ok(states.includes('role="alert"'));
  assert.ok(states.includes("دریافت جزئیات سنگ مزار ممکن نشد."));
  assert.ok(states.includes("تلاش دوباره"));
  assert.ok(states.includes("router.invalidate()"));
});

test("35 the generated route tree is never imported at runtime", () => {
  assert.ok(!ALL_CODE.includes("routeTree.gen"));
});

test("36 the draft summary is announced politely and stays local", () => {
  const summary = read(SUMMARY);
  assert.ok(summary.includes('role="status"'));
  assert.ok(summary.includes('aria-live="polite"'));
  assert.ok(summary.includes("خلاصه انتخاب"));
  assert.ok(summary.includes("هزینهٔ حمل و نصب جداگانه و پس از بررسی محل اعلام می‌شود."));
  const page = read(PAGE);
  assert.ok(page.includes("امکان آماده‌سازی خلاصه سفارش در حال حاضر وجود ندارد."));
  assert.ok(page.includes("disabled:cursor-not-allowed"));
});

test("37 changing the variant clears every selected option", () => {
  const page = read(PAGE);
  assert.match(page, /setVariantId\(nextId\);\s*setOptionIds\(\[\]\);/);
});
