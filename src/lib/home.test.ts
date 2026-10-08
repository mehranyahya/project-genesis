import { test } from "node:test";
import assert from "node:assert/strict";
import { buildHomeViewModel } from "./home";
import type { HomeEditorialSelection } from "./home";
import type { Guide, Media, PortfolioItem } from "./content/types";

function media(id = "a"): Media {
  return {
    src: "/media/aaaaaaaaaaaaaaaaaaaaaaaa/" + id.padStart(16, "a") + "-1280w.webp",
    srcSet: [320, 640, 1280]
      .map(
        (width) =>
          "/media/aaaaaaaaaaaaaaaaaaaaaaaa/" +
          id.padStart(16, "a") +
          "-" +
          width +
          "w.webp " +
          width +
          "w",
      )
      .join(", "),
    width: 1280,
    height: 1600,
    alt: "نمای سنگ",
  };
}
function work(id: string, withMedia = true): PortfolioItem {
  return { publicReferenceId: id, media: withMedia ? [media()] : [], summary: "  شرح واقعی  " };
}
function guide(slug: string, summary: string | null = null): Guide {
  return { slug, title: "راهنما " + slug, summary, body: "", seo: null, updatedAt: "2026-01-01" };
}
const EMPTY = { portfolioItems: [], guides: [] };
const selection: HomeEditorialSelection = {
  projects: { memorial: "pf-1001", architectural: "pf-1002", bespoke: "pf-1003" },
};
const works = [work("pf-1001"), work("pf-1002"), work("pf-1003")];

test("empty adapters and absent editorial assets publish no invented content", () => {
  const model = buildHomeViewModel(EMPTY);
  assert.equal(model.heroMedia, null);
  assert.equal(model.heroMobileMedia, null);
  assert.deepEqual(model.serviceMedia, { memorial: null, architectural: null, bespoke: null });
  assert.equal(model.showPortfolio, false);
  assert.equal(model.showGuide, false);
  assert.equal(model.guide, null);
  assert.deepEqual(model.projects, []);
});
test("portfolio order never implicitly chooses a brand hero", () => {
  const model = buildHomeViewModel({ ...EMPTY, portfolioItems: works });
  assert.equal(model.heroMedia, null);
  assert.equal(model.showPortfolio, false);
});
test("hero and mobile crop require explicit approved editorial selection", () => {
  const hero = media("a"),
    mobile = { ...media("b"), height: 853 };
  const model = buildHomeViewModel(EMPTY, { hero, heroMobile: mobile });
  assert.equal(model.heroMedia, hero);
  assert.equal(model.heroMobileMedia, mobile);
  assert.equal(buildHomeViewModel(EMPTY, { heroMobile: mobile }).heroMobileMedia, null);
});
test("partial service imagery stays text-led for all three services", () => {
  const model = buildHomeViewModel(EMPTY, { services: { memorial: media() } });
  assert.deepEqual(model.serviceMedia, { memorial: null, architectural: null, bespoke: null });
});
test("a complete service-media set preserves equal imagery", () => {
  const services = { memorial: media("a"), architectural: media("b"), bespoke: media("c") };
  assert.deepEqual(buildHomeViewModel(EMPTY, { services }).serviceMedia, services);
});
test("one or two classified works cannot create a lopsided selection", () => {
  for (const count of [1, 2]) {
    const model = buildHomeViewModel(
      { ...EMPTY, portfolioItems: works.slice(0, count) },
      selection,
    );
    assert.equal(model.showPortfolio, false);
    assert.deepEqual(model.projects, []);
  }
});
test("three explicitly selected real works render in service order", () => {
  const model = buildHomeViewModel({ ...EMPTY, portfolioItems: [...works].reverse() }, selection);
  assert.equal(model.showPortfolio, true);
  assert.deepEqual(
    model.projects.map((item) => item.service),
    ["memorial", "architectural", "bespoke"],
  );
  assert.deepEqual(
    model.projects.map((item) => item.publicReferenceId),
    ["pf-1001", "pf-1002", "pf-1003"],
  );
  assert.ok(model.projects.every((item) => item.summary === "شرح واقعی"));
});
test("duplicate, malformed, absent or media-less references never satisfy all services", () => {
  const candidates: HomeEditorialSelection[] = [
    { projects: { memorial: "pf-1001", architectural: "pf-1001", bespoke: "pf-1003" } },
    { projects: { memorial: "private-key", architectural: "pf-1002", bespoke: "pf-1003" } },
    { projects: { memorial: "pf-9999", architectural: "pf-1002", bespoke: "pf-1003" } },
  ];
  for (const candidate of candidates)
    assert.equal(
      buildHomeViewModel({ ...EMPTY, portfolioItems: works }, candidate).showPortfolio,
      false,
    );
  assert.equal(
    buildHomeViewModel(
      { ...EMPTY, portfolioItems: [works[0]!, works[1]!, work("pf-1003", false)] },
      selection,
    ).showPortfolio,
    false,
  );
});
test("blank work summaries are omitted", () => {
  const items = works.map((item) => ({ ...item, summary: "  " }));
  assert.ok(
    buildHomeViewModel({ ...EMPTY, portfolioItems: items }, selection).projects.every(
      (item) => item.summary === null,
    ),
  );
});
test("the first valid guide is used and blank summaries are omitted", () => {
  const model = buildHomeViewModel({
    ...EMPTY,
    guides: [guide(""), guide("one", "  "), guide("two")],
  });
  assert.equal(model.showGuide, true);
  assert.equal(model.guide?.slug, "one");
  assert.equal(model.guide?.summary, null);
});
test("guide summaries are trimmed", () => {
  assert.equal(
    buildHomeViewModel({ ...EMPTY, guides: [guide("one", " شرح ")] }).guide?.summary,
    "شرح",
  );
});
test("adapter inputs and editorial selections are never mutated", () => {
  const input = { portfolioItems: works, guides: [guide("one")] };
  const before = JSON.stringify({ input, selection });
  buildHomeViewModel(input, selection);
  assert.equal(JSON.stringify({ input, selection }), before);
});
