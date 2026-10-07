import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { delegationErrors, routeUnit } from "@/lib/route-defs/route-test-source";
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

test("hero carries a neutral H1 and only one H1 exists", () => {
  const hero = read("components/home/home-hero.tsx");
  assert.ok(hero.includes("زیبایی سنگ، دقت ساخت."));
  assert.equal(ALL.split("<h1").length - 1, 1);
});

test("hero fills the desktop grid when no real media is available", () => {
  const hero = read("components/home/home-hero.tsx");
  assert.ok(hero.includes('media ? "lg:col-span-7" : "lg:col-span-12"'));
  assert.ok(hero.includes("flex flex-col justify-center"));
});

test("hero CTAs and destinations are exact", () => {
  const hero = read("components/home/home-hero.tsx");
  assert.ok(hero.includes("بررسی خدمات"));
  assert.ok(hero.includes('href="#home-services"'));
  assert.ok(hero.includes("شروع گفت‌وگو"));
  assert.ok(hero.includes('to="/quote"'));
});

test("three choice paths are exact", () => {
  assert.deepEqual(
    CHOICE_PATHS.map((item) => [item.label, item.to]),
    [
      ["سنگ مزار", "/grave-stones"],
      ["سنگ ساختمانی", "/building-stone"],
      ["ساخت سفارشی", "/stoneworks"],
    ],
  );
});

test("four process labels are exact and rendered as an ordered list", () => {
  assert.deepEqual(
    [...PROCESS_STEPS],
    ["انتخاب مسیر", "ثبت مشخصات", "بررسی درخواست", "هماهنگی جزئیات"],
  );
  const html = renderToStaticMarkup(<HomeProcess />);
  assert.ok(html.includes("<ol"));
  for (const label of PROCESS_STEPS) assert.ok(html.includes(label));
});

test("final CTA text and destination are exact", () => {
  const sections = read("components/home/home-sections.tsx");
  assert.ok(sections.includes("برای انتخاب یا ساخت سنگ، گفت‌وگو را شروع کنیم."));
  assert.ok(sections.includes("شروع گفت‌وگو"));
  assert.ok(sections.includes("سنگ ساختمانی"));
  assert.ok(sections.includes('to: "/building-stone"'));
});

test("home reads official adapters only and imports no content files", () => {
  const route = routeUnit("routes/index.tsx", "homeRouteOptions");
  assert.ok(route.includes('from "@/lib/content/adapters"'));
  assert.equal(route.includes("getProducts({ featuredOnly: true"), false);
  assert.equal(route.includes("getPortfolioItems({ limit: 1 })"), false);
  assert.ok(route.includes("getGuides({ limit: 1 })"));
  assert.ok(route.includes("contentListForLocale"));
  assert.equal(/from\s+["'][^"']*\.(json|md|mdx|png|jpe?g|svg|webp)["']/.test(ALL), false);
  assert.equal(/fixture|mock|sample|lorem/i.test(ALL), false);
});

test("home renders no price, contact, trust or testimonial content", () => {
  for (const needle of [
    "تومان",
    "قیمت",
    "تلفن",
    "واتساپ",
    "تلگرام",
    "tel:",
    "whatsapp",
    "telegram",
    "ضمانت",
    "نظرات مشتریان",
    "Badge",
  ]) {
    assert.equal(ALL.includes(needle), false, `forbidden content in home: ${needle}`);
  }
});

test("home files contain no raw colors and no banned effects", () => {
  for (const rel of HOME_FILES) {
    const source = read(rel);
    assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(source), false, `raw color in ${rel}`);
    assert.equal(/rgba?\(|hsla?\(/.test(source), false, `raw color fn in ${rel}`);
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
      assert.equal(source.includes(banned), false, `${banned} found in ${rel}`);
    }
  }
});

test("home layout honours responsive services, touch targets and focus", () => {
  for (const rel of ["components/home/home-hero.tsx", "components/home/home-sections.tsx"]) {
    const source = read(rel);
    assert.ok(source.includes("page-section"), `${rel} missing shared section geometry`);
    assert.ok(source.includes("min-h-12"), `${rel} missing touch target`);
    assert.ok(source.includes("focus-visible:outline"), `${rel} missing focus indicator`);
  }
  const card = read("components/home/home-link-card.tsx");
  assert.ok(card.includes("min-h-12"));
  assert.ok(card.includes("focus-visible:outline"));
});

test("baseline empty adapters render no optional section markup", () => {
  const model = buildHomeViewModel({ guides: [] });
  assert.equal(model.showPortfolio, false);
  assert.equal(model.showGuide, false);
  const page = read("components/home/home-page.tsx");
  assert.equal(page.includes("HomeFeaturedProducts"), false);
  assert.ok(page.includes("model.showPortfolio ?"));
  assert.ok(page.includes("model.showGuide"));
});

test("no new route is declared by the home scaffold", () => {
  const route = read("routes/index.tsx");
  assert.equal(route.split("createFileRoute(").length - 1, 1);
  assert.ok(route.includes('createFileRoute("/")'));
  assert.equal(ALL.includes("routeTree.gen"), false);
});

test("fa and en home wrappers declare their route ids and delegate to the shared factory", () => {
  assert.deepEqual(
    delegationErrors({
      rel: "routes/index.tsx",
      faRouteId: "/",
      enRouteId: "/en/",
      exportName: "homeRouteOptions",
    }),
    [],
  );
});
