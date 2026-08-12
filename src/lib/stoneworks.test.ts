import { test } from "node:test";
import assert from "node:assert/strict";

import { BUSINESS_ROUTES, PRIMARY_NAV } from "./navigation";
import { BASE_STATIC_PATHS, localizePath } from "./i18n/locale";
import { EN_MESSAGES } from "./i18n/en";
import { translate } from "./i18n/messages";
import { delegationErrors, readSource, routeUnitBody } from "./route-defs/route-test-source";
import {
  STONEWORKS_CATEGORIES_HEADING,
  STONEWORKS_CTA_LABEL,
  STONEWORKS_CTA_TEMPLATE,
  STONEWORKS_HEADING,
  STONEWORKS_INTRO,
  STONEWORKS_META_DESCRIPTION,
  STONEWORKS_META_TITLE,
  STONEWORKS_PRICE_STATE_LABEL,
  STONEWORKS_PROCESS_STEPS,
  STONEWORK_CATEGORIES,
  STONEWORK_CATEGORY_IDS,
  stoneworkAnchorId,
  stoneworkHeadingId,
} from "./stoneworks";

const ARABIC = /[\u0600-\u06FF]/;
const PAGE = readSource("components/stoneworks/stoneworks-page.tsx");

/* --------------------------------------------------------------- catalogue */

test("the catalogue has exactly the five approved categories, in order and unique", () => {
  assert.deepEqual(
    [...STONEWORK_CATEGORY_IDS],
    [
      "sculpture_art",
      "water_landscape",
      "architectural_elements",
      "furniture_interiors",
      "monuments_bespoke",
    ],
  );
  const ids = STONEWORK_CATEGORIES.map((category) => category.id);
  assert.deepEqual(ids, [...STONEWORK_CATEGORY_IDS]);
  assert.equal(new Set(ids).size, 5);
  assert.equal(new Set(STONEWORK_CATEGORIES.map((c) => c.label)).size, 5);
});

test("every category is review-only with no amount and no invented product data", () => {
  for (const category of STONEWORK_CATEGORIES) {
    assert.equal(category.priceType, "review");
    assert.equal(category.amountToman, null);
    assert.ok(category.label.trim().length > 0);
    assert.ok(category.description.trim().length > 0);
    assert.ok(category.applications.trim().length > 0);
    // No inventory, media, availability, product or currency leaks into a
    // production category.
    const record = category as unknown as Record<string, unknown>;
    for (const banned of ["media", "images", "slug", "code", "stock", "isAvailable", "variants"]) {
      assert.equal(banned in record, false, `${category.id} must not carry ${banned}`);
    }
    for (const text of [category.description, category.applications]) {
      assert.equal(/\d/.test(text), false, `${category.id} must not state numbers`);
      assert.equal(/تومان|toman|ریال/i.test(text), false);
    }
  }
});

test("anchors are derived only from the stable id", () => {
  assert.equal(stoneworkAnchorId("sculpture_art"), "stonework-sculpture-art");
  assert.equal(stoneworkHeadingId("water_landscape"), "stonework-water-landscape-title");
  const anchors = STONEWORK_CATEGORIES.map((category) => stoneworkAnchorId(category.id));
  assert.equal(new Set(anchors).size, 5);
  for (const anchor of anchors) assert.match(anchor, /^stonework-[a-z-]+$/);
});

/* ------------------------------------------------------------------ page UI */

test("the page renders exactly one H1, five category articles and one CTA per card", () => {
  assert.equal(PAGE.split("<h1").length - 1, 1);
  assert.ok(PAGE.includes("t(STONEWORKS_HEADING)"));
  assert.ok(PAGE.includes("t(STONEWORKS_INTRO)"));
  assert.ok(PAGE.includes("STONEWORK_CATEGORIES.map"));
  assert.ok(PAGE.includes("<article"));
  assert.ok(PAGE.includes("id={stoneworkAnchorId(category.id)}"));
  assert.ok(PAGE.includes("aria-labelledby={stoneworkHeadingId(category.id)}"));
  assert.ok(PAGE.includes("t(STONEWORKS_PRICE_STATE_LABEL)"));
  assert.equal(PAGE.split('to="/quote"').length - 1, 1);
  assert.ok(PAGE.includes("t(STONEWORKS_CTA_LABEL)"));
  assert.ok(PAGE.includes("STONEWORKS_CTA_TEMPLATE"));
  assert.ok(PAGE.includes("STONEWORKS_PROCESS_STEPS.map"));
  assert.equal(STONEWORKS_PROCESS_STEPS.length, 4);
});

test("the page shows no image, no placeholder product and no promise of time or price", () => {
  for (const banned of ["<img", "PublicMedia", "srcSet", "Lorem", "placeholder"]) {
    assert.equal(PAGE.includes(banned), false, `page must not contain ${banned}`);
  }
  const copy = [
    STONEWORKS_HEADING,
    STONEWORKS_INTRO,
    STONEWORKS_CATEGORIES_HEADING,
    ...STONEWORKS_PROCESS_STEPS,
  ].join(" ");
  for (const promise of ["روز", "هفته", "تومان", "موجود", "تخفیف", "گارانتی"]) {
    assert.equal(copy.includes(promise), false, `copy must not promise “${promise}”`);
  }
});

/* ----------------------------------------------------------- route contract */

test("both locale wrappers delegate to the one shared factory", () => {
  assert.deepEqual(
    delegationErrors({
      rel: "routes/stoneworks.tsx",
      faRouteId: "/stoneworks",
      enRouteId: "/en/stoneworks",
      exportName: "stoneworksRouteOptions",
    }),
    [],
  );
  const unit = routeUnitBody("routes/stoneworks.tsx", "stoneworksRouteOptions");
  assert.ok(unit.includes('basePath: "/stoneworks"'));
  assert.ok(unit.includes("localizedHead"));
  // Pure catalogue page: no adapter call, no detail route in this gate.
  for (const banned of ["getProducts", "getPortfolioItems", "getSite", "$slug", "notFound("]) {
    assert.equal(unit.includes(banned), false, `stoneworks route must not use ${banned}`);
  }
});

test("route and navigation contracts include /stoneworks exactly once", () => {
  assert.equal(BUSINESS_ROUTES.filter((route) => route === "/stoneworks").length, 1);
  assert.equal(BASE_STATIC_PATHS.filter((path) => path === "/stoneworks").length, 1);
  assert.equal(PRIMARY_NAV.filter((item) => item.to === "/stoneworks").length, 1);
  assert.equal(localizePath("/stoneworks", "fa"), "/stoneworks");
  assert.equal(localizePath("/stoneworks", "en"), "/en/stoneworks");
});

/* --------------------------------------------------------------- English */

test("every Stoneworks string has a natural English entry with no Arabic script", () => {
  const keys = [
    STONEWORKS_HEADING,
    STONEWORKS_INTRO,
    STONEWORKS_META_TITLE,
    STONEWORKS_META_DESCRIPTION,
    STONEWORKS_CATEGORIES_HEADING,
    STONEWORKS_PRICE_STATE_LABEL,
    STONEWORKS_CTA_LABEL,
    STONEWORKS_CTA_TEMPLATE,
    ...STONEWORKS_PROCESS_STEPS,
    ...STONEWORK_CATEGORIES.flatMap((category) => [
      category.label,
      category.description,
      category.applications,
    ]),
  ];
  const table = EN_MESSAGES as Record<string, string>;
  for (const key of keys) {
    const english = table[key];
    assert.ok(english, `missing English entry: ${key}`);
    assert.equal(ARABIC.test(english), false, `English entry still Persian: ${key}`);
    assert.equal(translate("en", key), english);
    assert.equal(translate("fa", key), key);
  }
  assert.equal(
    translate("en", STONEWORKS_CTA_TEMPLATE, { category: "Sculpture and stone art" }),
    "Request a commission: Sculpture and stone art",
  );
});
