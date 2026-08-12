import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { delegationErrors, routeUnit, routeUnitBody } from "@/lib/route-defs/route-test-source";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

const ROUTE = "routes/grave-stones/index.tsx";

const ROUTE_FACTORY = "graveStoneListRouteOptions";
/** fa wrapper + en wrapper + the shared factory section that owns this route. */
const routeSource = () => routeUnit(ROUTE, ROUTE_FACTORY);
/** Route unit without the shared import header, used for per-route bans. */
const routeBody = () => routeUnitBody(ROUTE, ROUTE_FACTORY);
const readUnit = (rel: string) => (rel === ROUTE ? routeSource() : read(rel));
const PAGE = "components/grave-stones/grave-stone-list-page.tsx";
const FILTER = "components/grave-stones/grave-stone-filter.tsx";
const CARD = "components/grave-stones/grave-stone-card.tsx";
const STATES = "components/grave-stones/grave-stone-list-states.tsx";
const VIEW_MODEL = "lib/grave-stone-list.ts";

const FILES = [ROUTE, PAGE, FILTER, CARD, STATES, VIEW_MODEL];
const ALL = FILES.map(readUnit).join("\n");

const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const ALL_CODE = FILES.map((rel) => stripComments(readUnit(rel))).join("\n");

test("route consumes only the official getProducts() adapter", () => {
  const route = routeSource();
  assert.ok(route.includes('from "@/lib/content/adapters"'));
  assert.ok(route.includes("await getProducts()"));
  assert.ok(route.includes("buildGraveStoneListModel"));
  for (const name of ["getPortfolioItems", "getGuides", "getSite", "getPage", "getProduct("]) {
    assert.ok(!routeBody().includes(name), `route must not call ${name}`);
  }
});

test("no direct JSON, markdown, fixture or asset imports exist", () => {
  const bad = /from\s+["'][^"']*\.(json|md|mdx|png|jpe?g|svg|webp|avif|woff2?)["']/;
  assert.ok(!bad.test(ALL_CODE));
  assert.ok(!/fixture/i.test(ALL_CODE));
  assert.ok(!ALL_CODE.includes("routeTree.gen"));
});

test("exactly one H1 with the locked heading and the structural intro", () => {
  assert.equal(ALL.split("<h1").length - 1, 1);
  assert.ok(read(PAGE).includes("فروشگاه سنگ مزار"));
  assert.ok(read(PAGE).includes("محصولات فعال را بر اساس نوع اجرا، کد سنگ و اندازه بررسی کنید."));
});

test("three paths carry exact labels, behaviour and destination", () => {
  const page = read(PAGE);
  assert.ok(page.includes("سنگ مزار ساده"));
  assert.ok(page.includes('type: "simple"'));
  assert.ok(page.includes("اجرای CNC"));
  assert.ok(page.includes('type: "cnc_box"'));
  assert.ok(page.includes("سفارش سفارشی"));
  assert.ok(page.includes('to="/grave-stones/custom"'));
  assert.equal(page.split("aria-controls={RESULTS_ID}").length - 1, 2);
});

test("filter labels, legend and neutral values are exact", () => {
  const filter = read(FILTER);
  for (const label of ["نوع اجرا", "سنگ", "اندازه", "فیلتر محصولات", "پاک‌کردن فیلترها"]) {
    assert.ok(filter.includes(label), `missing label ${label}`);
  }
  for (const label of ["همه نوع‌ها", "همه سنگ‌ها", "همه اندازه‌ها", "سفارشی", "۱۲۰×۶۰"]) {
    assert.ok(filter.includes(label), `missing option ${label}`);
  }
  assert.ok(filter.includes("<fieldset"));
  assert.ok(filter.includes("<legend"));
  assert.equal(filter.split("<select").length - 1, 3);
  assert.equal(filter.split("htmlFor=").length - 1, 3);
});

test("card CTA text and typed route destination are exact", () => {
  const card = read(CARD);
  assert.ok(card.includes("مشاهده و انتخاب"));
  assert.ok(card.includes('to="/grave-stones/$slug"'));
  assert.ok(card.includes("params={{ slug: item.slug }}"));
  assert.ok(!card.includes("{item.slug}<"));
  assert.ok(!card.includes("item.code"));
});

test("catalog empty and filtered empty are independent states", () => {
  const states = read(STATES);
  assert.ok(states.includes("در حال حاضر محصول فعالی برای نمایش وجود ندارد."));
  assert.ok(states.includes("ثبت سفارش سفارشی"));
  assert.ok(states.includes('to="/grave-stones/custom"'));
  assert.ok(states.includes("با این فیلترها محصولی پیدا نشد."));
  assert.ok(states.includes("GraveStoneCatalogEmpty"));
  assert.ok(states.includes("GraveStoneFilteredEmpty"));
  const page = read(PAGE);
  assert.ok(page.includes("catalogEmpty ? (") || page.includes("{catalogEmpty ?"));
  assert.ok(page.includes("visible.length === 0"));
});

test("loading state is busy, labelled, static and free of spinners", () => {
  const states = read(STATES);
  assert.ok(states.includes('aria-busy="true"'));
  assert.ok(states.includes("در حال دریافت فهرست سنگ مزار"));
  assert.ok(!/spinner|shimmer|animate-/i.test(states));
});

test("error state is an alert with a real retry and no raw message", () => {
  const states = read(STATES);
  assert.ok(states.includes('role="alert"'));
  assert.ok(states.includes("دریافت فهرست سنگ مزار ممکن نشد."));
  assert.ok(states.includes("تلاش دوباره"));
  assert.ok(states.includes("router.invalidate()"));
  assert.ok(!ALL_CODE.includes("error.message"));
  assert.ok(!ALL_CODE.includes("error.stack"));
});

test("route wires pending and error components and defines no local notFound", () => {
  const route = routeSource();
  assert.ok(route.includes("pendingComponent: GraveStoneListLoading"));
  assert.ok(route.includes("errorComponent: GraveStoneListError"));
  assert.ok(!route.includes("notFoundComponent"));
});

test("no price, price status or contact surface exists", () => {
  for (const banned of [
    "amountToman",
    "priceUpdatedAt",
    "priceType",
    "قیمت",
    "تومان",
    "واتساپ",
    "تلگرام",
    "تلفن",
    "tel:",
    "whatsapp",
  ]) {
    assert.ok(!ALL_CODE.includes(banned), `banned token present: ${banned}`);
  }
});

test("card media is intentional, sanitized and 4:5", () => {
  const card = read(CARD);
  assert.ok(card.includes("<PublicMedia"));
  assert.ok(card.includes("aspect-[4/5]"));
  assert.ok(card.includes("media={item.leadMedia}"));
  for (const banned of [
    "mediaKey",
    "privacyCleared",
    "consentReference",
    "backgroundImage",
    "placeholder",
  ]) {
    assert.ok(!ALL_CODE.includes(banned), `private or unsafe media token: ${banned}`);
  }
});

test("zero raw colors and zero banned effects", () => {
  const rawColor = /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(/;
  assert.ok(!rawColor.test(ALL_CODE));
  for (const banned of [
    "gradient",
    "backdrop-filter",
    "backdrop-blur",
    "blur(",
    "glass",
    "mix-blend",
    "data-theme",
    "animate-",
    "shadow-2xl",
    "shadow-xl",
    "framer-motion",
  ]) {
    assert.ok(!ALL_CODE.includes(banned), `banned effect: ${banned}`);
  }
});

test("touch targets and focus-visible indicators are present", () => {
  for (const rel of [PAGE, FILTER, CARD, STATES]) {
    const source = read(rel);
    assert.ok(source.includes("min-h-11"), `${rel} needs min-h-11`);
    assert.ok(source.includes("focus-visible:outline-2"), `${rel} needs focus-visible outline`);
  }
});

test("responsive 4 / 8 / 12 grids are present", () => {
  for (const rel of [PAGE, FILTER]) {
    const source = read(rel);
    assert.ok(source.includes("grid-cols-4"));
    assert.ok(source.includes("md:grid-cols-8"));
    assert.ok(source.includes("lg:grid-cols-12"));
  }
  assert.ok(read(CARD).includes("col-span-4 md:col-span-4 lg:col-span-4"));
});

test("latin stone codes are isolated with bdi", () => {
  assert.ok(read(CARD).includes('<bdi dir="ltr">'));
});

test("result status uses fa-IR formatting inside a polite live region", () => {
  const page = read(PAGE);
  assert.ok(page.includes('Intl.NumberFormat("fa-IR")'));
  assert.ok(page.includes('aria-live="polite"'));
  assert.ok(page.includes("محصول"));
});

test("filter state never touches URL, storage or cookies", () => {
  for (const banned of [
    "localStorage",
    "sessionStorage",
    "document.cookie",
    "useSearch",
    "navigate(",
  ]) {
    assert.ok(!ALL_CODE.includes(banned), `banned persistence: ${banned}`);
  }
});

test("fa and en wrappers declare their route ids and delegate to the shared factory", () => {
  assert.deepEqual(
    delegationErrors({
      rel: ROUTE,
      faRouteId: "/grave-stones/",
      enRouteId: "/en/grave-stones/",
      exportName: ROUTE_FACTORY,
    }),
    [],
  );
});
