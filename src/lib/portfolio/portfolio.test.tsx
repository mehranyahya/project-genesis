import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

const ROUTE = "routes/portfolio.tsx";
const PAGE = "components/portfolio/portfolio-page.tsx";
const CARD = "components/portfolio/portfolio-card.tsx";
const STATES = "components/portfolio/portfolio-states.tsx";
const MODEL = "lib/portfolio.ts";

const COMPONENTS = [PAGE, CARD, STATES];
const FILES = [ROUTE, ...COMPONENTS, MODEL];
const ALL = FILES.map(read).join("\n");

const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const ALL_CODE = FILES.map((rel) => stripComments(read(rel))).join("\n");
const COMPONENT_CODE = COMPONENTS.map((rel) => stripComments(read(rel))).join("\n");

test("1-4 route consumes only getPortfolioItems() and keeps the existing route id", () => {
  const route = read(ROUTE);
  assert.ok(route.includes('from "@/lib/content/adapters"'));
  assert.ok(route.includes("await getPortfolioItems()"));
  assert.ok(route.includes('createFileRoute("/portfolio")'));
  for (const name of [
    "getProducts",
    "getProduct(",
    "getGuides",
    "getGuide(",
    "getSite",
    "getPage",
  ]) {
    assert.ok(!route.includes(name), `route must not call ${name}`);
  }
});

test("5 no JSON, markdown, fixture or asset imports exist", () => {
  const bad = /from\s+["'][^"']*\.(json|md|mdx|png|jpe?g|svg|webp|avif|woff2?)["']/;
  assert.ok(!bad.test(ALL_CODE));
  assert.ok(!/fixture/i.test(ALL_CODE));
});

test("6-7 exactly one H1 with the locked heading and intro", () => {
  assert.equal(ALL.split("<h1").length - 1, 1);
  const page = read(PAGE);
  assert.ok(page.includes("نمونه‌کارها"));
  assert.ok(
    page.includes(
      "نمونه‌کارهای عمومی مهرآرا را بررسی کنید و برای استعلام اجرای مشابه، مرجع عمومی همان نمونه را همراه درخواست بفرستید.",
    ),
  );
});

test("8 the empty text is exact and accessible", () => {
  const states = read(STATES);
  assert.ok(states.includes("در حال حاضر نمونه‌کار عمومی و دارای مجوز نمایش ثبت نشده است."));
  assert.ok(states.includes('role="status"'));
});

test("9 loading state is accessible and static", () => {
  const states = stripComments(read(STATES));
  assert.ok(states.includes('aria-busy="true"'));
  assert.ok(states.includes("در حال دریافت نمونه‌کارها"));
  for (const banned of ["animate-", "spinner", "shimmer", "transition-transform"]) {
    assert.ok(!states.includes(banned), `loading must not use ${banned}`);
  }
});

test("10 error state is accessible with a real router retry", () => {
  const states = read(STATES);
  assert.ok(states.includes('role="alert"'));
  assert.ok(states.includes("دریافت نمونه‌کارها ممکن نشد."));
  assert.ok(states.includes("تلاش دوباره"));
  assert.ok(states.includes("router.invalidate()"));
  assert.ok(!/error\.(message|stack)/.test(states));
});

test("11-13 CTA text is exact and only the view-model quote path is used", () => {
  const card = read(CARD);
  assert.ok(card.includes("مشابه این را می‌خواهم"));
  assert.ok(card.includes("href={card.quotePath}"));
  assert.ok(!card.includes("?source="));
  assert.ok(!card.includes("URLSearchParams"));
  assert.ok(!card.includes("window.location"));
});

test("14-15 no local portfolio regex; the existing helper is imported", () => {
  assert.ok(!/pf-\[0-9\]/.test(ALL_CODE));
  const model = read(MODEL);
  assert.ok(model.includes('from "./portfolio-reference"'));
  assert.ok(model.includes("normalizePortfolioReference"));
  assert.ok(model.includes("buildQuoteReferralPath"));
  assert.ok(!/`\/quote/.test(ALL_CODE));
});

test("16-18 quote route, request-form files and the helper are unchanged by this surface", () => {
  const quote = read("routes/quote.tsx");
  assert.ok(!quote.includes("portfolio-page"));
  assert.ok(!quote.includes("buildPortfolioModel"));
  const helper = read("lib/portfolio-reference.ts");
  assert.ok(helper.includes("export const PORTFOLIO_REFERENCE_PATTERN = /^pf-[0-9]{4,}$/;"));
  assert.ok(helper.includes("export function buildQuoteReferralPath"));
  const form = read("components/request-form/request-form.tsx");
  assert.ok(!form.includes("portfolio-page"));
  assert.ok(!form.includes("buildPortfolioModel"));
});

test("19-23 only browser-safe responsive media reaches the portfolio surface", () => {
  const code = COMPONENT_CODE.replaceAll("text-text-caption", "");
  const card = read(CARD);
  assert.ok(card.includes("ResponsiveImage"));
  assert.ok(card.includes("media={card.media}"));
  assert.ok(card.includes('fit="cover"'));
  assert.ok(card.includes("aspect-[4/5]"));
  for (const banned of [
    "mediaKey",
    "caption",
    "consentReference",
    "privacyCleared",
    "<video",
    "background-image",
    "bg-[url",
    "placeholder",
  ]) {
    assert.ok(!code.includes(banned), `components must not contain ${banned}`);
  }
});

test("24-26 reference and stone code are bidi-isolated; the size label is reused", () => {
  const card = read(CARD);
  assert.equal(card.split('<bdi dir="ltr">').length - 1, 2);
  assert.ok(card.includes("{card.publicReferenceId}"));
  assert.ok(card.includes("{card.stoneCode}"));
  assert.ok(card.includes("{card.sizeLabel}"));
  assert.ok(read(MODEL).includes('SIZE_LABELS } from "./product-detail"'));
});

test("27-32 no carousel, filter, price, contact CTA, storage or PII surface", () => {
  for (const banned of [
    "carousel",
    "slider",
    "lightbox",
    "autoplay",
    "filter",
    "search",
    "category",
    "قیمت",
    "تومان",
    "whatsapp",
    "wa.me",
    "tel:",
    "localStorage",
    "sessionStorage",
    "document.cookie",
    "phone",
    "customer",
    "deceased",
    "birth",
  ]) {
    assert.ok(!ALL_CODE.toLowerCase().includes(banned.toLowerCase()), `must not contain ${banned}`);
  }
});

test("33-35 the 4:5 card, 4/8/12 grid, touch target and focus are present", () => {
  const card = read(CARD);
  assert.ok(card.includes("aspect-[4/5]"));
  assert.ok(card.includes("min-h-11"));
  assert.ok(card.includes("focus-visible:outline"));
  const page = read(PAGE);
  assert.ok(page.includes("grid-cols-4"));
  assert.ok(page.includes("md:grid-cols-8"));
  assert.ok(page.includes("lg:grid-cols-12"));
  assert.ok(card.includes("lg:col-span-4"));
  assert.ok(card.includes("<article"));
});

test("36 no raw colors, gradients, blur, glass or large shadows", () => {
  for (const banned of [
    "#",
    "rgb(",
    "hsl(",
    "gradient",
    "blur",
    "backdrop",
    "shadow-lg",
    "shadow-xl",
    "shadow-2xl",
    "rounded",
    "text-white",
    "bg-black",
  ]) {
    assert.ok(!COMPONENT_CODE.includes(banned), `components must not contain ${banned}`);
  }
});

test("37-40 single H1, no generated route tree import, no backend surface", () => {
  assert.equal(ALL.split("<h1").length - 1, 1);
  assert.ok(!ALL_CODE.includes("routeTree.gen"));
  for (const banned of ["createServerFn", "supabase", "fetch(", "process.env"]) {
    assert.ok(!ALL_CODE.includes(banned), `must not contain ${banned}`);
  }
  const page = read(PAGE);
  assert.ok(page.includes("cards.length === 0"));
  assert.ok(page.includes("<PortfolioEmpty />"));
});
