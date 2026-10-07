import { test } from "node:test";
import assert from "node:assert/strict";

import { buildHomeViewModel, HOME_SERVICES } from "./home";
import type { HomeProject } from "./home";
import type { Guide, Media } from "./content/types";

const media: Media = {
  src: "/media/aaaaaaaaaaaaaaaaaaaaaaaa/bbbbbbbbbbbbbbbb-1280w.webp",
  srcSet: "",
  width: 1280,
  height: 1600,
  alt: "Stone",
};

function project(
  service: HomeProject["service"],
  reference: string = `pf-${1001 + HOME_SERVICES.indexOf(service)}`,
): HomeProject {
  return { service, item: { publicReferenceId: reference, media: [media] } };
}

function guide(slug: string, summary: string | null = null): Guide {
  return {
    slug,
    title: slug,
    summary,
    body: "",
    seo: null,
    updatedAt: "2026-01-01",
  };
}

test("empty adapters omit optional media, projects and guides", () => {
  const model = buildHomeViewModel({ guides: [] });
  assert.equal(model.heroMedia, null);
  assert.deepEqual(model.serviceMedia, {});
  assert.deepEqual(model.projects, []);
  assert.equal(model.showPortfolio, false);
  assert.equal(model.guide, null);
  assert.equal(model.showGuide, false);
});

test("home never selects a memorial product as a neutral hero", () => {
  const model = buildHomeViewModel({ guides: [] });
  assert.equal(model.heroMedia, null);
  assert.equal("products" in model, false);
});

test("only explicitly supplied public hero media is selected", () => {
  const model = buildHomeViewModel({ guides: [], presentation: { heroMedia: media } });
  assert.equal(model.heroMedia, media);
});

test("three real classified projects give one equal slot per service", () => {
  const model = buildHomeViewModel({
    guides: [],
    presentation: { projects: [...HOME_SERVICES].reverse().map((service) => project(service)) },
  });
  assert.equal(model.showPortfolio, true);
  assert.deepEqual(
    model.projects.map((item) => item.service),
    [...HOME_SERVICES],
  );
});

test("one or two projects cannot produce a biased home row", () => {
  for (const count of [1, 2]) {
    const model = buildHomeViewModel({
      guides: [],
      presentation: { projects: HOME_SERVICES.slice(0, count).map((service) => project(service)) },
    });
    assert.equal(model.showPortfolio, false);
    assert.equal(model.projects.length, 0);
  }
});

test("three projects from one service cannot fill the home row", () => {
  const model = buildHomeViewModel({
    guides: [],
    presentation: {
      projects: [project("grave_stone"), project("grave_stone"), project("grave_stone")],
    },
  });
  assert.equal(model.showPortfolio, false);
});

test("a project without media or reference is ineligible", () => {
  const invalid = [
    { ...project("stoneworks"), item: { publicReferenceId: "", media: [media] } },
    { ...project("stoneworks"), item: { publicReferenceId: "pf-1001", media: [] } },
  ];
  for (const item of invalid) {
    const model = buildHomeViewModel({
      guides: [],
      presentation: { projects: [project("grave_stone"), project("building_stone"), item] },
    });
    assert.equal(model.showPortfolio, false);
  }
});

test("one public project cannot masquerade as all three services", () => {
  const model = buildHomeViewModel({
    guides: [],
    presentation: { projects: HOME_SERVICES.map((service) => project(service, "pf-1001")) },
  });
  assert.equal(model.showPortfolio, false);
});

test("extra projects never give a service extra prominence", () => {
  const model = buildHomeViewModel({
    guides: [],
    presentation: {
      projects: [...HOME_SERVICES.map((service) => project(service)), project("stoneworks")],
    },
  });
  assert.equal(model.projects.length, 3);
});

test("blank guides are ignored and the first valid guide is retained", () => {
  const model = buildHomeViewModel({
    guides: [guide(""), guide("one", " Summary "), guide("two")],
  });
  assert.equal(model.showGuide, true);
  assert.equal(model.guide?.slug, "one");
  assert.equal(model.guide?.summary, "Summary");
});

test("blank guide summaries are omitted", () => {
  const model = buildHomeViewModel({ guides: [guide("one", "  ")] });
  assert.equal(model.guide?.summary, null);
});

test("missing service media has no fabricated fallback", () => {
  const model = buildHomeViewModel({
    guides: [],
    presentation: { serviceMedia: { stoneworks: media } },
  });
  assert.equal(model.serviceMedia.stoneworks, media);
  assert.equal(model.serviceMedia.grave_stone, undefined);
  assert.equal(model.serviceMedia.building_stone, undefined);
});

test("input data is never mutated", () => {
  const input = {
    guides: [guide("one")],
    presentation: { projects: HOME_SERVICES.map((service) => project(service)) },
  };
  const before = JSON.stringify(input);
  buildHomeViewModel(input);
  assert.equal(JSON.stringify(input), before);
});
