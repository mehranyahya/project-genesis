import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { delegationErrors, routeUnit } from "@/lib/route-defs/route-test-source";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

const ROUTE = "routes/grave-stones/$slug.tsx";

const ROUTE_FACTORY = "productDetailRouteOptions";
/** fa wrapper + en wrapper + the shared factory section that owns this route. */
const routeSource = () => routeUnit(ROUTE, ROUTE_FACTORY);
const readUnit = (rel: string) => (rel === ROUTE ? routeSource() : read(rel));
const PAGE = "components/product/product-detail-page.tsx";
const STAGE = "components/product/product-media-stage.tsx";
const PUBLIC_MEDIA = "components/media/public-media.tsx";
const SELECTION = "components/product/product-selection.tsx";
const PRICE = "components/product/product-price-panel.tsx";
const SUMMARY = "components/product/product-draft-summary.tsx";
const STATES = "components/product/product-detail-states.tsx";
const MODEL = "lib/product-detail.ts";
const DRAFT = "lib/request-draft.ts";

const FILES = [ROUTE, PAGE, STAGE, PUBLIC_MEDIA, SELECTION, PRICE, SUMMARY, STATES, MODEL, DRAFT];

const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const ALL = FILES.map(readUnit).join("\n");
const ALL_CODE = FILES.map((rel) => stripComments(readUnit(rel))).join("\n");

test("1 the route consumes only getProduct(), getCatalogVersion() and getSite()", () => {
  const route = routeSource();
  assert.ok(route.includes('from "@/lib/content/adapters"'));
  assert.ok(route.includes("getProduct(params.slug)"));
  assert.ok(route.includes("getCatalogVersion()"));
  assert.ok(route.includes("getSite()"));
  assert.ok(route.includes("Promise.all"));
  for (const name of ["getProducts(", "getPortfolioItems", "getGuides", "getPage("]) {
    assert.ok(!route.includes(name), `route must not call ${name}`);
  }
});

test("2 no direct JSON, markdown, fixture or raw asset import exists", () => {
  const bad = /from\s+["'][^"']*\.(json|md|mdx|png|jpe?g|svg|webp|avif|woff2?)["']/;
  assert.ok(!bad.test(ALL_CODE));
  assert.ok(!/fixture/i.test(ALL_CODE));
});

test("3 the official notFound() is used for invalid products", () => {
  const route = routeSource();
  assert.ok(route.includes('notFound } from "@tanstack/react-router"'));
  assert.ok(route.includes("throw notFound()"));
  assert.ok(route.includes("buildProductDetailModel"));
});

test("4 no local notFoundComponent is declared", () => {
  assert.ok(!ALL_CODE.includes("notFoundComponent"));
});

test("5 pending and error components are real and wired", () => {
  const route = routeSource();
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

test("8 the product media stage uses the exact 4:5 ratio", () => {
  assert.ok(read(STAGE).includes("aspect-[4/5]"));
  assert.ok(read(STATES).includes("aspect-[4/5]"));
});

test("9 list and portfolio cards now expose intentional 4:5 media stages", () => {
  assert.ok(read("components/grave-stones/grave-stone-card.tsx").includes("aspect-[4/5]"));
  assert.ok(read("components/portfolio/portfolio-card.tsx").includes("aspect-[4/5]"));
});

test("10 the list card renders only the sanitized PublicMedia DTO", () => {
  const card = read("components/grave-stones/grave-stone-card.tsx");
  assert.ok(card.includes("مشاهده و انتخاب"));
  assert.ok(card.includes("<PublicMedia"));
  assert.ok(!/mediaKey|privacyCleared|consentReference/.test(card));
});

test("11 public media owns img/srcSet/fixed dimensions and AVIF source", () => {
  const media = read(PUBLIC_MEDIA);
  assert.ok(media.includes("<picture"));
  assert.ok(media.includes("<source"));
  assert.ok(media.includes('type="image/avif"'));
  assert.ok(media.includes("<img"));
  assert.ok(media.includes("src={media.src}"));
  assert.ok(media.includes("srcSet={media.srcSet}"));
  assert.ok(media.includes("width={media.width}"));
  assert.ok(media.includes("height={media.height}"));
  assert.ok(media.includes('loading={priority ? "eager" : "lazy"}'));
  assert.ok(media.includes('fetchPriority={priority ? "high" : "auto"}'));
});

test("12 private mediaKey and consent state never appear in the UI/model layer", () => {
  for (const rel of [
    PAGE,
    STAGE,
    PUBLIC_MEDIA,
    SELECTION,
    PRICE,
    SUMMARY,
    STATES,
    ROUTE,
    DRAFT,
    MODEL,
  ]) {
    assert.ok(
      !/mediaKey|privacyCleared|consentReference/.test(stripComments(read(rel))),
      `${rel} leaked private media metadata`,
    );
  }
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
  assert.ok(stage.includes("bg-surface-media"));
  const stageCode = stage.replace(/disabled:opacity-45/g, "");
  assert.ok(!/\/\d0\b|animate-|autoplay|carousel|embla/i.test(stageCode));
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
  // Owner-approved share scope: slug is the stable public route key and may be
  // passed to ProductShare only. It must never appear in visible product copy.
  const slugUses = read(PAGE).match(/model\.slug/g) ?? [];
  assert.equal(slugUses.length, 1);
  assert.ok(read(PAGE).includes("<ProductShare slug={model.slug}"));
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

test("fa and en wrappers declare their route ids and delegate to the shared factory", () => {
  assert.deepEqual(
    delegationErrors({
      rel: ROUTE,
      faRouteId: "/grave-stones/$slug",
      enRouteId: "/en/grave-stones/$slug",
      exportName: ROUTE_FACTORY,
    }),
    [],
  );
});
