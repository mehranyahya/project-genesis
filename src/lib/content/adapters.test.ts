import { test } from "node:test";
import assert from "node:assert/strict";

import * as adapters from "./adapters";

const ADAPTER_NAMES = [
  "getProducts",
  "getProduct",
  "getPortfolioItems",
  "getGuides",
  "getGuide",
  "getSite",
  "getPage",
  "getCatalogVersion",
] as const;

test("all eight content adapters exist", () => {
  for (const name of ADAPTER_NAMES) {
    assert.equal(typeof (adapters as Record<string, unknown>)[name], "function");
  }
});

test("list adapters default to empty arrays", async () => {
  assert.deepEqual(await adapters.getProducts(), []);
  assert.deepEqual(await adapters.getPortfolioItems(), []);
  assert.deepEqual(await adapters.getGuides(), []);
});

test("single-entity adapters default to null", async () => {
  assert.equal(await adapters.getProduct("any"), null);
  assert.equal(await adapters.getGuide("any"), null);
  assert.equal(await adapters.getSite(), null);
  assert.equal(await adapters.getPage("any"), null);
  assert.equal(await adapters.getCatalogVersion(), null);
});

test("adapters import no fixtures or content files at runtime", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("./adapters.ts", import.meta.url), "utf8");
  const imports = source.match(/^import .*$/gm) ?? [];
  for (const line of imports) {
    assert.ok(
      line.includes('from "./types"') || line.startsWith("import type"),
      `unexpected runtime import: ${line}`,
    );
  }
  assert.equal(/\.json|fixture|content\//i.test(source), false);
});
