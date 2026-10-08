import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { delegationErrors, routeUnit, routeUnitBody } from "@/lib/route-defs/route-test-source";
import { renderToStaticMarkup } from "react-dom/server";
import { buildHomeViewModel } from "@/lib/home";
import { HomeProcess, CHOICE_PATHS, PROCESS_STEPS } from "@/components/home/home-sections";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");
const HOME_FILES = [
  "routes/index.tsx",
  "components/home/home-page.tsx",
  "components/home/home-hero.tsx",
  "components/home/home-sections.tsx",
  "components/home/home-link-card.tsx",
];
const ALL = HOME_FILES.map(read).join("\n");

test("the shared brand hero has one H1 and names all three services", () => {
  const hero = read("components/home/home-hero.tsx");
  assert.ok(hero.includes("زیبایی سنگ، دقت ساخت."));
  assert.ok(hero.includes("سنگ مزار · سنگ ساختمانی · ساخت سفارشی"));
  assert.equal(ALL.split("<h1").length - 1, 1);
  assert.equal(hero.includes("انتخاب و اجرای سنگ مزار"), false);
});
test("the no-photo hero uses the full grid without an image placeholder", () => {
  const hero = read("components/home/home-hero.tsx");
  assert.ok(hero.includes("lg:col-span-12 lg:min-h-[22rem]"));
  assert.ok(hero.includes("{media ? ("));
  assert.equal(hero.includes("opacity-0"), false);
});
test("hero actions lead to equal services and a general conversation", () => {
  const hero = read("components/home/home-hero.tsx");
  assert.ok(hero.includes('href="#home-services"'));
  assert.ok(hero.includes('to="/quote"'));
  assert.equal(hero.includes('to="/grave-stones"'), false);
  assert.ok(hero.includes("ui-action-inverse"));
});
test("the three equal service paths target the correct distinct business flows", () => {
  assert.deepEqual(
    CHOICE_PATHS.map((item) => [item.label, item.to]),
    [
      ["سنگ مزار", "/grave-stones"],
      ["سنگ ساختمانی", "/building-stone"],
      ["ساخت سفارشی", "/stoneworks"],
    ],
  );
  const sections = read("components/home/home-sections.tsx");
  assert.ok(sections.includes("auto-rows-fr"));
  assert.ok(sections.includes("md:grid-cols-3"));
});
test("all services share four honest review steps in an ordered list", () => {
  assert.deepEqual(
    [...PROCESS_STEPS],
    ["انتخاب خدمت", "شرح نیاز و جزئیات", "ثبت برای بررسی", "هماهنگی برای تأیید نهایی"],
  );
  const html = renderToStaticMarkup(<HomeProcess />);
  assert.ok(html.includes("<ol"));
  for (const label of PROCESS_STEPS) assert.ok(html.includes(label));
});
test("the final action is service-neutral and goes to the general request", () => {
  const sections = read("components/home/home-sections.tsx");
  assert.ok(sections.includes("برای انتخاب یا ساخت سنگ، گفت‌وگو را شروع کنیم."));
  assert.ok(sections.includes('to="/quote"'));
  assert.equal(sections.includes("برای انتخاب سنگ مزار آماده‌اید؟"), false);
});
test("the home reads approved guides without fetching unselected product or work catalogues", () => {
  const route = routeUnit("routes/index.tsx", "homeRouteOptions");
  assert.ok(route.includes('from "@/lib/content/adapters"'));
  const body = routeUnitBody("routes/index.tsx", "homeRouteOptions");
  assert.ok(body.includes("getGuides()"));
  assert.ok(body.includes("contentListForLocale(guides, locale)"));
  assert.equal(/getProducts\(|getPortfolioItems\(/.test(body), false);
  assert.equal(/from\s+["'][^"']*\.(json|md|mdx|png|jpe?g|svg|webp)["']/.test(ALL), false);
});
test("home has no fabricated price, contact or trust claim", () => {
  for (const needle of [
    "تومان",
    "قیمت",
    "تلفن",
    "واتساپ",
    "تلگرام",
    "tel:",
    "whatsapp",
    "ضمانت",
    "نظرات مشتریان",
    "Badge",
  ]) {
    assert.equal(ALL.includes(needle), false, "forbidden home content: " + needle);
  }
});
test("home uses semantic colors with no costly decorative effects", () => {
  for (const rel of HOME_FILES) {
    const source = read(rel);
    assert.equal(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/.test(source), false);
    for (const banned of [
      "gradient",
      "backdrop-filter",
      "backdrop-blur",
      "blur(",
      "animate-",
      "data-theme",
      "spinner",
      "shimmer",
    ]) {
      assert.equal(source.includes(banned), false, banned + " in " + rel);
    }
  }
});
test("home retains responsive grids, 48px actions and visible focus", () => {
  const hero = read("components/home/home-hero.tsx");
  for (const token of [
    "grid-cols-4",
    "md:grid-cols-8",
    "lg:grid-cols-12",
    "min-h-12",
    "focus-visible:outline",
  ])
    assert.ok(hero.includes(token));
  const sections = read("components/home/home-sections.tsx");
  assert.ok(sections.includes("min-h-12"));
  assert.ok(sections.includes("focus-visible:outline"));
  const card = read("components/home/home-link-card.tsx");
  assert.ok(card.includes("min-h-12"));
  assert.ok(card.includes("focus-visible:outline"));
});
test("empty adapters omit selected work and editorial guides", () => {
  const model = buildHomeViewModel({ portfolioItems: [], guides: [] });
  assert.equal(model.showPortfolio, false);
  assert.equal(model.showGuide, false);
  const page = read("components/home/home-page.tsx");
  assert.ok(page.includes("model.showPortfolio ?"));
  assert.ok(page.includes("model.showGuide"));
  assert.equal(page.includes("HomeFeaturedProducts"), false);
});
test("home wrappers retain the same two routes and shared locale factory", () => {
  assert.deepEqual(
    delegationErrors({
      rel: "routes/index.tsx",
      faRouteId: "/",
      enRouteId: "/en/",
      exportName: "homeRouteOptions",
    }),
    [],
  );
  assert.equal(read("routes/index.tsx").split("createFileRoute(").length - 1, 1);
  assert.equal(ALL.includes("routeTree.gen"), false);
});
