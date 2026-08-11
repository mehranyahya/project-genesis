import { test } from "node:test";
import assert from "node:assert/strict";

import type { Media, PortfolioItem } from "./content/types";
import { buildPortfolioModel } from "./portfolio";
import { SIZE_LABELS } from "./product-detail";

const media = (overrides: Partial<Media> = {}): Media => ({
  src: `/media/catalog/${"a".repeat(64)}-800.webp`,
  srcSet: {
    avif: `/media/catalog/${"a".repeat(64)}-480.avif 480w, /media/catalog/${"a".repeat(64)}-800.avif 800w`,
    webp: `/media/catalog/${"a".repeat(64)}-480.webp 480w, /media/catalog/${"a".repeat(64)}-800.webp 800w`,
  },
  width: 800,
  height: 1000,
  alt: "نمای نمونه‌کار",
  ...overrides,
});

function first(cards: ReturnType<typeof buildPortfolioModel>) {
  const card = cards[0];
  assert.ok(card);
  return card;
}

const item = (overrides: Partial<PortfolioItem> = {}): PortfolioItem => ({
  publicReferenceId: "pf-1001",
  media: [media()],
  ...overrides,
});

test("1 an empty adapter result produces an empty model", () => {
  assert.deepEqual(buildPortfolioModel([]), []);
  assert.deepEqual(buildPortfolioModel(null), []);
  assert.deepEqual(buildPortfolioModel(undefined), []);
});

test("2 the input is never mutated", () => {
  const input = [item({ stoneCode: "  ST-1  ", summary: "  متن  " })];
  const snapshot = JSON.parse(JSON.stringify(input));
  buildPortfolioModel(input);
  assert.deepEqual(JSON.parse(JSON.stringify(input)), snapshot);
});

test("3 invalid references are dropped", () => {
  for (const bad of ["pf-100", "PF-1001", "pf-10a1", "quote", "  "]) {
    assert.deepEqual(buildPortfolioModel([item({ publicReferenceId: bad })]), []);
  }
});

test("4 an empty reference is dropped", () => {
  assert.deepEqual(buildPortfolioModel([item({ publicReferenceId: "" })]), []);
});

test("5 the CTA path comes from the existing helper only", () => {
  const card = first(buildPortfolioModel([item()]));
  assert.equal(card.quotePath, "/quote?source=portfolio&reference=pf-1001");
});

test("6 duplicate references keep only the first valid item", () => {
  const cards = buildPortfolioModel([
    item({ stoneCode: "A" }),
    item({ stoneCode: "B" }),
    item({ publicReferenceId: "pf-2002" }),
  ]);
  assert.deepEqual(
    cards.map((card) => card.publicReferenceId),
    ["pf-1001", "pf-2002"],
  );
  assert.equal(first(cards).stoneCode, "A");
});

test("7 adapter order is preserved", () => {
  const cards = buildPortfolioModel([
    item({ publicReferenceId: "pf-3003" }),
    item({ publicReferenceId: "pf-1001" }),
    item({ publicReferenceId: "pf-2002" }),
  ]);
  assert.deepEqual(
    cards.map((card) => card.publicReferenceId),
    ["pf-3003", "pf-1001", "pf-2002"],
  );
});

test("8 an item without media is dropped", () => {
  assert.deepEqual(buildPortfolioModel([item({ media: [] })]), []);
});

test("9 a non-public media path drops the item", () => {
  assert.deepEqual(
    buildPortfolioModel([item({ media: [media({ src: "/private/file.webp" })] })]),
    [],
  );
});

test("10 a malformed srcSet drops the item", () => {
  assert.deepEqual(
    buildPortfolioModel([
      item({ media: [media({ srcSet: { avif: "invalid", webp: "invalid" } })] }),
    ]),
    [],
  );
});

test("11 a mismatched intrinsic width drops the item", () => {
  assert.deepEqual(buildPortfolioModel([item({ media: [media({ width: 1200 })] })]), []);
});

test("12 an empty alt drops the item", () => {
  assert.deepEqual(buildPortfolioModel([item({ media: [media({ alt: "" })] })]), []);
});

test("13 one approved media entry makes the item publishable", () => {
  const cards = buildPortfolioModel([
    item({ media: [media({ src: "/private/file.webp" }), media()] }),
  ]);
  assert.equal(cards.length, 1);
});

test("14 internal publication fields never reach the view-model", () => {
  const serialized = JSON.stringify(buildPortfolioModel([item()]));
  assert.ok(!serialized.includes("mediaKey"));
  assert.ok(!serialized.includes("caption"));
  assert.ok(!serialized.includes("consentReference"));
});

test("17 the stone code is trimmed", () => {
  const card = first(buildPortfolioModel([item({ stoneCode: "  ST-7  " })]));
  assert.equal(card.stoneCode, "ST-7");
});

test("18 an empty or missing stone code becomes null", () => {
  assert.equal(first(buildPortfolioModel([item({ stoneCode: "   " })])).stoneCode, null);
  assert.equal(first(buildPortfolioModel([item()])).stoneCode, null);
});

test("19 an undefined size becomes null", () => {
  const card = first(buildPortfolioModel([item()]));
  assert.equal(card.sizeCode, null);
  assert.equal(card.sizeLabel, null);
});

test("20 a null size becomes null", () => {
  const card = first(buildPortfolioModel([item({ sizeCode: null })]));
  assert.equal(card.sizeCode, null);
  assert.equal(card.sizeLabel, null);
});

test("21 a valid size uses the existing label contract", () => {
  const card = first(buildPortfolioModel([item({ sizeCode: "160x60" })]));
  assert.equal(card.sizeCode, "160x60");
  assert.equal(card.sizeLabel, SIZE_LABELS["160x60"]);
});

test("22 the summary is trimmed and never rewritten", () => {
  const card = first(buildPortfolioModel([item({ summary: "  اجرای کامل سنگ  " })]));
  assert.equal(card.summary, "اجرای کامل سنگ");
});

test("23 an empty summary becomes null", () => {
  assert.equal(first(buildPortfolioModel([item({ summary: "   " })])).summary, null);
  assert.equal(first(buildPortfolioModel([item({ summary: null })])).summary, null);
});

test("24 the quote path carries exactly source and reference", () => {
  const card = first(buildPortfolioModel([item({ publicReferenceId: "pf-20304" })]));
  const url = new URL(card.quotePath, "https://example.test");
  assert.equal(url.pathname, "/quote");
  assert.deepEqual([...url.searchParams.keys()].sort(), ["reference", "source"]);
  assert.equal(url.searchParams.get("source"), "portfolio");
  assert.equal(url.searchParams.get("reference"), "pf-20304");
});

test("25 media and alt text never appear in the quote path", () => {
  const card = first(buildPortfolioModel([item()]));
  assert.ok(!card.quotePath.includes("media"));
  assert.ok(!card.quotePath.includes("نمای"));
});

test("26 the view-model exposes only the seven approved keys", () => {
  const card = first(
    buildPortfolioModel([item({ stoneCode: "ST-1", sizeCode: "120x60", summary: "متن" })]),
  );
  assert.deepEqual(Object.keys(card).sort(), [
    "media",
    "publicReferenceId",
    "quotePath",
    "sizeCode",
    "sizeLabel",
    "stoneCode",
    "summary",
  ]);
});
