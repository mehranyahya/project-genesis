import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
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

test("hero carries the exact locked H1 and only one H1 exists", () => {
  const hero = read("components/home/home-hero.tsx");
  assert.ok(hero.includes("انتخاب و اجرای سنگ مزار با طراحی دقیق و متریال ماندگار"));
  assert.equal(ALL.split("<h1").length - 1, 1);
});

test("hero CTAs and destinations are exact", () => {
  const hero = read("components/home/home-hero.tsx");
  assert.ok(hero.includes("انتخاب سنگ مزار"));
  assert.ok(hero.includes('to="/grave-stones"'));
  assert.ok(hero.includes("مشاهده نمونه‌کارها"));
  assert.ok(hero.includes('to="/portfolio"'));
});

test("approved hero media uses a 5/7 split with no text overlay", () => {
  const hero = read("components/home/home-hero.tsx");
  assert.ok(hero.includes("ResponsiveImage"));
  assert.ok(hero.includes("media={media}"));
  assert.ok(hero.includes("priority"));
  assert.ok(hero.includes("lg:col-span-5"));
  assert.ok(hero.includes("lg:col-span-7"));
  assert.ok(hero.includes("aspect-[4/5]"));
  assert.ok(!/absolute|background-image|bg-\[url|mediaKey/.test(hero));
});

test("three choice paths are exact", () => {
  assert.deepEqual(
    CHOICE_PATHS.map((item) => [item.label, item.to]),
    [
      ["فروشگاه سنگ مزار", "/grave-stones"],
      ["سفارش سفارشی", "/grave-stones/custom"],
      ["نمونه‌کارها", "/portfolio"],
    ],
  );
});

test("four process labels are exact and rendered as an ordered list", () => {
  assert.deepEqual(
    [...PROCESS_STEPS],
    ["انتخاب سنگ", "انتخاب اندازه و جزئیات", "بازبینی خلاصه", "ثبت برای بررسی"],
  );
  const html = renderToStaticMarkup(<HomeProcess />);
  assert.ok(html.includes("<ol"));
  for (const label of PROCESS_STEPS) assert.ok(html.includes(label));
});

test("final CTA text and destination are exact", () => {
  const sections = read("components/home/home-sections.tsx");
  assert.ok(sections.includes("برای انتخاب سنگ مزار آماده‌اید؟"));
  assert.ok(sections.includes("انتخاب و ثبت سفارش"));
  assert.ok(sections.includes("بررسی سنگ ساختمانی"));
  assert.ok(sections.includes('to="/building-stone"'));
});

test("home reads official adapters only and imports no content files", () => {
  const route = read("routes/index.tsx");
  assert.ok(route.includes('from "@/lib/content/adapters"'));
  assert.ok(route.includes("getProducts({ featuredOnly: true, limit: 6 })"));
  assert.ok(route.includes("getPortfolioItems({ limit: 1 })"));
  assert.ok(route.includes("getGuides({ limit: 1 })"));
  assert.ok(route.includes("Promise.all"));
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

test("home layout honours the 4/8/12 grid, touch targets and focus", () => {
  for (const rel of ["components/home/home-hero.tsx", "components/home/home-sections.tsx"]) {
    const source = read(rel);
    assert.ok(source.includes("grid-cols-4"), `${rel} missing mobile grid`);
    assert.ok(source.includes("md:grid-cols-8"), `${rel} missing tablet grid`);
    assert.ok(source.includes("lg:grid-cols-12"), `${rel} missing desktop grid`);
    assert.ok(source.includes("min-h-11"), `${rel} missing touch target`);
    assert.ok(source.includes("focus-visible:outline"), `${rel} missing focus indicator`);
  }
  const card = read("components/home/home-link-card.tsx");
  assert.ok(card.includes("min-h-11"));
  assert.ok(card.includes("focus-visible:outline"));
});

test("baseline empty adapters render no optional section markup", () => {
  const model = buildHomeViewModel({ products: [], portfolioItems: [], guides: [] });
  assert.equal(model.showProducts, false);
  assert.equal(model.showPortfolio, false);
  assert.equal(model.showGuide, false);
  const page = read("components/home/home-page.tsx");
  assert.ok(page.includes("model.showProducts ?"));
  assert.ok(page.includes("model.showPortfolio ?"));
  assert.ok(page.includes("model.showGuide"));
});

test("no new route is declared by the home scaffold", () => {
  const route = read("routes/index.tsx");
  assert.equal(route.split("createFileRoute(").length - 1, 1);
  assert.ok(route.includes('createFileRoute("/")'));
  assert.equal(ALL.includes("routeTree.gen"), false);
});
