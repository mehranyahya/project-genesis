import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { isAllowedMediaAspect } from "../../../scripts/media-aspect.mjs";

test("all public owners accept the existing 4:5 portrait frame", () => {
  for (const owner of ["product", "portfolio", "building"]) {
    assert.equal(isAllowedMediaAspect(1280, 1600, owner), true);
  }
});

test("3:2 is available for project and architectural imagery while products keep 4:5", () => {
  assert.equal(isAllowedMediaAspect(1500, 1000, "portfolio"), true);
  assert.equal(isAllowedMediaAspect(1500, 1000, "building"), true);
  assert.equal(isAllowedMediaAspect(1500, 1000, "product"), false);
});

test("unapproved aspect ratios, invalid dimensions and unknown owners fail closed", () => {
  const invalid: [number, number][] = [
    [1280, 1280],
    [1920, 1080],
    [0, 1000],
    [-1280, 1600],
  ];
  for (const [width, height] of invalid) {
    assert.equal(isAllowedMediaAspect(width, height, "portfolio"), false);
  }
  assert.equal(isAllowedMediaAspect(1280.5, 1600, "portfolio"), false);
  assert.equal(isAllowedMediaAspect(NaN, 1600, "portfolio"), false);
  assert.equal(isAllowedMediaAspect(1280, 1600, "unknown"), false);
});

test("the media pipeline passes the owner and preserves the existing safety gates", () => {
  const pipeline = readFileSync(
    new URL("../../../scripts/generate-structured-content.mjs", import.meta.url),
    "utf8",
  );
  assert.ok(pipeline.includes("validateSource(bytes, contentType, ownerKind)"));
  for (const guard of [
    "MAX_SOURCE_BYTES",
    "MAX_SOURCE_PIXELS",
    "MIN_SOURCE_WIDTH",
    "declaredMime !== magic.mime",
    "privacy_cleared",
    "consent_reference",
    "assertMetadataStripped",
    "Animated or multi-page media is not allowed",
  ]) {
    assert.ok(pipeline.includes(guard), guard);
  }
});
