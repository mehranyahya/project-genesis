import assert from "node:assert/strict";
import { test } from "node:test";
import type { Guide, Media, PortfolioItem } from "./content/types";
import { HOME_EDITORIAL_REFERENCES } from "./home-editorial-config";
import { homeNeedsPortfolio, loadHomeViewModel } from "./home-editorial";
import type { HomeEditorialReferences } from "./home-editorial";

const first = "a".repeat(24);
const second = "b".repeat(24);
const media = (alt: string, assetId: string): Media => ({
  src: `/media/${assetId}/aaaaaaaaaaaaaaaa-1280w.webp`,
  srcSet: "",
  width: 1280,
  height: 1600,
  alt,
});
const work = (id: string, locale = "fa"): PortfolioItem => ({
  publicReferenceId: id,
  locale,
  media: [media(locale + "-first", first), media(locale + "-second", second)],
});
const guide = (locale: string): Guide => ({
  locale,
  slug: "care-" + locale,
  title: locale + "-guide",
  summary: null,
  body: "",
  seo: null,
  updatedAt: "2026-10-08",
});
const refs: HomeEditorialReferences = {
  hero: { publicReferenceId: "pf-1001", assetId: second },
  heroMobile: { publicReferenceId: "pf-1001", assetId: first },
  services: {
    memorial: { publicReferenceId: "pf-1001", assetId: first },
    architectural: { publicReferenceId: "pf-1002", assetId: first },
    bespoke: { publicReferenceId: "pf-1003", assetId: first },
  },
  projects: { memorial: "pf-1001", architectural: "pf-1002", bespoke: "pf-1003" },
};

test("both unconfigured homes skip the work adapter while retaining locale-filtered guides", async () => {
  for (const locale of ["fa", "en"] as const) {
    let calls = 0;
    const model = await loadHomeViewModel(locale, HOME_EDITORIAL_REFERENCES[locale], {
      getGuides: async () => [guide("fa"), guide("en")],
      getPortfolioItems: async () => {
        calls++;
        return [work("pf-1001")];
      },
    });
    assert.equal(calls, 0);
    assert.equal(model.heroMedia, null);
    assert.equal(model.showPortfolio, false);
    assert.equal(model.guide?.slug, "care-" + locale);
  }
});

test("explicit references make exactly one work call and resolve the requested image after locale filtering", async () => {
  let calls = 0;
  const fa = ["pf-1001", "pf-1002", "pf-1003"].map((id) => work(id));
  const en = fa.map((item) => work(item.publicReferenceId, "en"));
  const items = [...fa, ...en].reverse();
  const before = JSON.stringify({ items, refs });
  const model = await loadHomeViewModel("en", refs, {
    getGuides: async () => [],
    getPortfolioItems: async () => {
      calls++;
      return items;
    },
  });
  assert.equal(calls, 1);
  assert.equal(model.heroMedia?.alt, "en-second");
  assert.equal(model.heroMobileMedia?.alt, "en-first");
  assert.equal(model.showPortfolio, true);
  assert.ok(model.projects.every((project) => project.media.alt === "en-first"));
  assert.ok(Object.values(model.serviceMedia).every((item) => item?.alt === "en-first"));
  assert.equal(JSON.stringify({ items, refs }), before);
});

test("a mobile-only selection or malformed references do not fetch a catalogue", () => {
  assert.equal(
    homeNeedsPortfolio({ heroMobile: { publicReferenceId: "pf-1001", assetId: first } }),
    false,
  );
  for (const assetId of ["", "../private", "a".repeat(23), "A".repeat(24), "a".repeat(25)])
    assert.equal(homeNeedsPortfolio({ hero: { publicReferenceId: "pf-1001", assetId } }), false);
  assert.equal(
    homeNeedsPortfolio({ hero: { publicReferenceId: "/private/object", assetId: first } }),
    false,
  );
});

test("missing, revoked or wrong-language media never become a fallback hero", async () => {
  for (const reference of [
    { publicReferenceId: "pf-9999", assetId: first },
    { publicReferenceId: "pf-1001", assetId: "c".repeat(24) },
    { publicReferenceId: "pf-1001", assetId: "invalid" },
  ]) {
    const model = await loadHomeViewModel(
      "en",
      { hero: reference, heroMobile: refs.heroMobile! },
      { getGuides: async () => [], getPortfolioItems: async () => [work("pf-1001")] },
    );
    assert.equal(model.heroMedia, null);
    assert.equal(model.heroMobileMedia, null);
  }
  const model = await loadHomeViewModel(
    "fa",
    {
      hero: { publicReferenceId: " pf-1001 ", assetId: first },
      heroMobile: { publicReferenceId: "pf-1001", assetId: "c".repeat(24) },
    },
    { getGuides: async () => [], getPortfolioItems: async () => [work("pf-1001")] },
  );
  assert.equal(model.heroMedia?.alt, "fa-first");
  assert.equal(model.heroMobileMedia, null);
});

test("partial imagery and duplicate works do not bypass equal-service rules", async () => {
  const model = await loadHomeViewModel(
    "fa",
    {
      services: {
        memorial: { publicReferenceId: "pf-1001", assetId: first },
        architectural: { publicReferenceId: "pf-9999", assetId: first },
      },
      projects: { memorial: "pf-1001", architectural: "pf-1001", bespoke: "pf-1003" },
    },
    {
      getGuides: async () => [],
      getPortfolioItems: async () => [work("pf-1001"), work("pf-1003")],
    },
  );
  assert.deepEqual(model.serviceMedia, { memorial: null, architectural: null, bespoke: null });
  assert.deepEqual(model.projects, []);
  assert.equal(model.showPortfolio, false);
});

test("unlabelled source content remains Persian and cannot leak into English selections", async () => {
  const { locale: _locale, ...unlabelled } = work("pf-1001");
  const model = await loadHomeViewModel(
    "en",
    { hero: { publicReferenceId: "pf-1001", assetId: first } },
    { getGuides: async () => [], getPortfolioItems: async () => [unlabelled] },
  );
  assert.equal(model.heroMedia, null);
});

test("gallery reordering preserves a selected asset, and removal never selects its neighbour", async () => {
  const item = work("pf-1001");
  const references = { hero: refs.hero!, heroMobile: refs.heroMobile! };
  const reordered = await loadHomeViewModel("fa", references, {
    getGuides: async () => [],
    getPortfolioItems: async () => [{ ...item, media: [...item.media].reverse() }],
  });
  assert.equal(reordered.heroMedia?.alt, "fa-second");
  assert.equal(reordered.heroMobileMedia?.alt, "fa-first");
  const removed = await loadHomeViewModel("fa", references, {
    getGuides: async () => [],
    getPortfolioItems: async () => [{ ...item, media: item.media.slice(0, 1) }],
  });
  assert.equal(removed.heroMedia, null);
  assert.equal(removed.heroMobileMedia, null);
});
