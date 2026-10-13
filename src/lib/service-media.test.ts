import assert from "node:assert/strict";
import { test } from "node:test";
import type { Media, PortfolioItem, ServiceMediaReference } from "./content/types";
import { resolveServiceMedia } from "./service-media";

const asset = "a".repeat(24),
  hash = "b".repeat(16);
export const TEST_SERVICE_MEDIA: Media = {
  src: `/media/${asset}/${hash}-1280w.webp`,
  srcSet: [320, 640, 1280].map((w) => `/media/${asset}/${hash}-${w}w.webp ${w}w`).join(", "),
  width: 1280,
  height: 853,
  alt: "Synthetic approved stone image",
};
const buildingRef: ServiceMediaReference = { source: "building", assetId: asset };
const portfolioRef: ServiceMediaReference = {
  source: "portfolio",
  assetId: asset,
  publicReferenceId: "pf-1001",
};
const item: PortfolioItem = {
  locale: "en",
  publicReferenceId: "pf-1001",
  media: [TEST_SERVICE_MEDIA],
};

test("selected building samples and published project media use only the five public fields", () => {
  const source = {
    ...TEST_SERVICE_MEDIA,
    mediaKey: "synthetic-private-path",
    consentReference: "synthetic-private-consent",
  };
  const building = resolveServiceMedia([buildingRef], "building-stone", "fa", [source], []);
  assert.deepEqual(building, [{ media: TEST_SERVICE_MEDIA, portfolioReferenceId: null }]);
  assert.notEqual(building[0]!.media, source);
  assert.deepEqual(Object.keys(building[0]!.media).sort(), [
    "alt",
    "height",
    "src",
    "srcSet",
    "width",
  ]);
  assert.deepEqual(resolveServiceMedia([portfolioRef], "stoneworks", "en", [], [item]), [
    { media: TEST_SERVICE_MEDIA, portfolioReferenceId: "pf-1001" },
  ]);
});

test("missing, stale, wrong-service or ambiguous selections hide the whole image section", () => {
  for (const refs of [
    undefined,
    [],
    [buildingRef, buildingRef],
    Array(4).fill(buildingRef),
    [{ source: "building", assetId: "../private" }],
  ])
    assert.deepEqual(
      resolveServiceMedia(
        refs as ServiceMediaReference[],
        "building-stone",
        "fa",
        [TEST_SERVICE_MEDIA],
        [],
      ),
      [],
    );
  assert.deepEqual(
    resolveServiceMedia([buildingRef], "stoneworks", "fa", [TEST_SERVICE_MEDIA], []),
    [],
  );
  assert.deepEqual(resolveServiceMedia([buildingRef], "about", "fa", [TEST_SERVICE_MEDIA], []), []);
  assert.deepEqual(resolveServiceMedia([buildingRef], "building-stone", "fa", [], []), []);
  assert.deepEqual(
    resolveServiceMedia(
      [buildingRef],
      "building-stone",
      "fa",
      [TEST_SERVICE_MEDIA, TEST_SERVICE_MEDIA],
      [],
    ),
    [],
  );
  assert.deepEqual(resolveServiceMedia([portfolioRef], "stoneworks", "en", [], [item, item]), []);
});

test("service selection uses the exact stable asset, independent of gallery order; removal never chooses a replacement", () => {
  const other = {
    ...TEST_SERVICE_MEDIA,
    src: TEST_SERVICE_MEDIA.src.replace(asset, "c".repeat(24)),
  };
  for (const images of [
    [other, TEST_SERVICE_MEDIA],
    [TEST_SERVICE_MEDIA, other],
  ])
    assert.equal(
      resolveServiceMedia([portfolioRef], "stoneworks", "en", [], [{ ...item, media: images }])[0]!
        .media.src,
      TEST_SERVICE_MEDIA.src,
    );
  assert.deepEqual(
    resolveServiceMedia([portfolioRef], "stoneworks", "en", [], [{ ...item, media: [other] }]),
    [],
  );
  assert.deepEqual(
    resolveServiceMedia(
      [buildingRef, { source: "building", assetId: "c".repeat(24) }],
      "building-stone",
      "fa",
      [TEST_SERVICE_MEDIA],
      [],
    ),
    [],
  );
});

test("English images and project referrals require their own translation and never reuse Persian records or alt", () => {
  assert.deepEqual(
    resolveServiceMedia([portfolioRef], "stoneworks", "en", [], [{ ...item, locale: "fa" }]),
    [],
  );
  assert.deepEqual(
    resolveServiceMedia(
      [portfolioRef],
      "stoneworks",
      "en",
      [],
      [{ ...item, media: [{ ...TEST_SERVICE_MEDIA, alt: "عکس آزمون" }] }],
    ),
    [],
  );
  assert.deepEqual(
    resolveServiceMedia(
      [buildingRef],
      "building-stone",
      "en",
      [{ ...TEST_SERVICE_MEDIA, alt: "عکس آزمون" }],
      [],
    ),
    [],
  );
});

test("malformed responsive sources, dimensions and external image URLs fail closed", () => {
  for (const image of [
    { ...TEST_SERVICE_MEDIA, src: "https://fixtures.invalid/photo.webp" },
    { ...TEST_SERVICE_MEDIA, srcSet: "https://fixtures.invalid/photo.webp 1280w" },
    {
      ...TEST_SERVICE_MEDIA,
      srcSet: TEST_SERVICE_MEDIA.srcSet.replace("320w.webp 320w", "320w.webp 640w"),
    },
    { ...TEST_SERVICE_MEDIA, width: 0 },
    { ...TEST_SERVICE_MEDIA, height: -1 },
    { ...TEST_SERVICE_MEDIA, alt: "" },
  ])
    assert.deepEqual(resolveServiceMedia([buildingRef], "building-stone", "fa", [image], []), []);
});
