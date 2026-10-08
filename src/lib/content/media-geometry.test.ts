import { test } from "node:test";
import assert from "node:assert/strict";
import { isAllowedMediaAspect } from "../../../scripts/media-geometry.mjs";

test("product media remains restricted to approximately 4:5", () => {
  assert.equal(isAllowedMediaAspect(1280, 1600, "product"), true);
  for (const dimensions of [
    [1500, 1000],
    [1600, 900],
    [1280, 1280],
  ])
    assert.equal(isAllowedMediaAspect(dimensions[0]!, dimensions[1]!, "product"), false);
});
test("portfolio and building media admit 4:5 or 3:2 without admitting arbitrary crops", () => {
  for (const kind of ["portfolio", "building"]) {
    assert.equal(isAllowedMediaAspect(1280, 1600, kind), true);
    assert.equal(isAllowedMediaAspect(1500, 1000, kind), true);
    assert.equal(isAllowedMediaAspect(1600, 900, kind), false);
    assert.equal(isAllowedMediaAspect(1280, 1280, kind), false);
  }
});
test("unknown roles and invalid dimensions are rejected", () => {
  for (const values of [
    [0, 1600],
    [-1280, 1600],
    [1280, 0],
    [1280, Infinity],
    [1280.5, 1600],
  ])
    assert.equal(isAllowedMediaAspect(values[0]!, values[1]!, "portfolio"), false);
  assert.equal(isAllowedMediaAspect(1500, 1000, "unknown"), false);
});
