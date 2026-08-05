import { test } from "node:test";
import assert from "node:assert/strict";

import type { Product, ProductOption, ProductVariant } from "../lib/content/types";
import type { CustomFunnelSelection, CustomOptionRoleRegistry } from "../lib/custom-funnel";
import {
  CUSTOM_FUNNEL_OPTION_ROLES,
  CUSTOM_FUNNEL_SIZE_ORDER,
  EMPTY_CUSTOM_FUNNEL_SELECTION,
  buildCustomFunnelDraft,
  buildCustomFunnelModel,
  makeCustomFunnelStoneKey,
  makeCustomOptionRoleKey,
  reduceCustomFunnel,
} from "../lib/custom-funnel";
import { DRAFT_KEYS } from "../lib/request-draft";

const VERSION = "b".repeat(64);

// Test-only fixtures. They never enter the runtime registry or bundle.
const option = (over: Partial<ProductOption> = {}): ProductOption => ({
  id: "o-1",
  title: "گزینه",
  priceType: "fixed",
  amountToman: 100_000,
  priceUpdatedAt: "2026-01-02",
  isAvailable: true,
  compatibleSizeCodes: ["120x60", "160x60", "180x60", "custom"],
  ...over,
});

const variant = (over: Partial<ProductVariant> = {}): ProductVariant => ({
  id: "v-1",
  stoneCode: "MA-1001",
  sizeCode: "120x60",
  priceType: "fixed",
  amountToman: 1_000_000,
  priceUpdatedAt: "2026-01-01",
  includes: [],
  excludes: [],
  options: [],
  isAvailable: true,
  ...over,
});

const product = (over: Partial<Product> = {}): Product => ({
  id: "p-1",
  code: "MA-1001",
  slug: "sang-1",
  type: "simple",
  title: "سنگ یک",
  summary: null,
  description: null,
  isActive: true,
  isFeatured: false,
  media: [],
  variants: [variant()],
  seo: null,
  updatedAt: "2026-01-01",
  ...over,
});

const roles = (entries: Record<string, string>): CustomOptionRoleRegistry =>
  entries as CustomOptionRoleRegistry;

const build = (products: readonly Product[], registry: CustomOptionRoleRegistry = {}) =>
  buildCustomFunnelModel({ products, roles: registry });

test("1 empty products produce an empty model", () => {
  assert.equal(build([]).stones.length, 0);
  assert.equal(build(undefined as unknown as Product[]).stones.length, 0);
});

test("2 inactive products are dropped", () => {
  assert.equal(build([product({ isActive: false })]).stones.length, 0);
});

test("3 cnc_box products are removed entirely", () => {
  assert.equal(build([product({ type: "cnc_box" })]).stones.length, 0);
});

test("4 invalid products are dropped", () => {
  assert.equal(build([product({ title: "  " })]).stones.length, 0);
});

test("5 products without a valid variant are dropped", () => {
  assert.equal(build([product({ variants: [variant({ isAvailable: false })] })]).stones.length, 0);
});

test("6 stone order follows adapter order", () => {
  const model = build([
    product({
      id: "p-2",
      slug: "b",
      code: "C2",
      variants: [variant({ id: "v-2", stoneCode: "Z" })],
    }),
    product({
      id: "p-1",
      slug: "a",
      code: "C1",
      variants: [variant({ id: "v-1", stoneCode: "A" })],
    }),
  ]);
  assert.deepEqual(
    model.stones.map((stone) => stone.stoneCode),
    ["Z", "A"],
  );
});

test("7 duplicate product+stone combinations collapse", () => {
  const model = build([
    product({
      variants: [
        variant({ id: "v-1", stoneCode: "A", sizeCode: "120x60" }),
        variant({ id: "v-2", stoneCode: "A", sizeCode: "160x60" }),
      ],
    }),
  ]);
  assert.equal(model.stones.length, 1);
  assert.equal(model.stones[0]!.sizes.length, 2);
});

test("8 size order matches the locked M5 order", () => {
  assert.deepEqual([...CUSTOM_FUNNEL_SIZE_ORDER], ["120x60", "160x60", "180x60", "custom"]);
  const model = build([
    product({
      variants: [
        variant({ id: "v-c", stoneCode: "A", sizeCode: "custom" }),
        variant({ id: "v-b", stoneCode: "A", sizeCode: "180x60" }),
        variant({ id: "v-a", stoneCode: "A", sizeCode: "120x60" }),
      ],
    }),
  ]);
  assert.deepEqual(
    model.stones[0]!.sizes.map((size) => size.sizeCode),
    ["120x60", "180x60", "custom"],
  );
});

test("9 duplicate product+stone+size keeps the first only", () => {
  const model = build([
    product({
      variants: [
        variant({ id: "v-1", stoneCode: "A", sizeCode: "160x60" }),
        variant({ id: "v-2", stoneCode: "A", sizeCode: "160x60" }),
      ],
    }),
  ]);
  assert.deepEqual(
    model.stones[0]!.sizes.map((size) => size.variantId),
    ["v-1"],
  );
});

const doriProduct = (sizeCode: ProductVariant["sizeCode"]) =>
  product({
    variants: [
      variant({
        id: "v-d",
        sizeCode,
        options: [option({ id: "o-d", compatibleSizeCodes: [sizeCode] })],
      }),
    ],
  });

const doriRoles = roles({ [makeCustomOptionRoleKey("v-d", "o-d")]: "dori" });

test("10 a dori option is accepted on 160x60", () => {
  const model = build([doriProduct("160x60")], doriRoles);
  assert.equal(model.stones[0]!.sizes[0]!.dori.length, 1);
});

test("11 a dori option is accepted on 180x60", () => {
  const model = build([doriProduct("180x60")], doriRoles);
  assert.equal(model.stones[0]!.sizes[0]!.dori.length, 1);
});

test("12 a dori option is rejected on 120x60", () => {
  assert.equal(build([doriProduct("120x60")], doriRoles).stones.length, 0);
});

test("13 a dori option is rejected on custom", () => {
  assert.equal(build([doriProduct("custom")], doriRoles).stones.length, 0);
});

const stageProduct = product({
  variants: [
    variant({
      id: "v-s",
      options: [
        option({ id: "o-i", title: "قطعه" }),
        option({ id: "o-e", title: "حکاکی" }),
        option({ id: "o-x", title: "غیرمرتبط" }),
      ],
    }),
  ],
});

const stageRoles = roles({
  [makeCustomOptionRoleKey("v-s", "o-i")]: "inscription_piece",
  [makeCustomOptionRoleKey("v-s", "o-e")]: "engraving",
  [makeCustomOptionRoleKey("v-s", "o-x")]: "excluded",
});

test("14 inscription_piece lands in its own stage", () => {
  const size = build([stageProduct], stageRoles).stones[0]!.sizes[0]!;
  assert.deepEqual(
    size.inscriptionPiece.map((entry) => entry.id),
    ["o-i"],
  );
});

test("15 engraving lands in its own stage", () => {
  const size = build([stageProduct], stageRoles).stones[0]!.sizes[0]!;
  assert.deepEqual(
    size.engraving.map((entry) => entry.id),
    ["o-e"],
  );
});

test("16 excluded options never appear in any stage", () => {
  const size = build([stageProduct], stageRoles).stones[0]!.sizes[0]!;
  const all = [...size.dori, ...size.inscriptionPiece, ...size.engraving];
  assert.ok(!all.some((entry) => entry.id === "o-x"));
});

test("17 an unclassified option makes the path undeliverable", () => {
  const partial = roles({ [makeCustomOptionRoleKey("v-s", "o-i")]: "inscription_piece" });
  assert.equal(build([stageProduct], partial).stones.length, 0);
});

test("18 the registry never creates options", () => {
  const extra = roles({
    ...stageRoles,
    [makeCustomOptionRoleKey("v-s", "ghost")]: "engraving",
  });
  const size = build([stageProduct], extra).stones[0]!.sizes[0]!;
  const all = [...size.dori, ...size.inscriptionPiece, ...size.engraving];
  assert.deepEqual(all.map((entry) => entry.id).sort(), ["o-e", "o-i"]);
});

test("19 unavailable options never enter the model", () => {
  const p = product({
    variants: [variant({ id: "v-u", options: [option({ id: "o-u", isAvailable: false })] })],
  });
  const size = build([p], {}).stones[0]!.sizes[0]!;
  assert.equal(size.inscriptionPiece.length + size.engraving.length + size.dori.length, 0);
});

test("20 incompatible options never enter the model", () => {
  const p = product({
    variants: [
      variant({
        id: "v-i",
        sizeCode: "120x60",
        options: [option({ id: "o-i2", compatibleSizeCodes: ["180x60"] })],
      }),
    ],
  });
  const size = build([p], {}).stones[0]!.sizes[0]!;
  assert.equal(size.inscriptionPiece.length + size.engraving.length + size.dori.length, 0);
});

const filled = {
  stoneKey: "k",
  variantId: "v",
  doriIds: ["a"],
  inscriptionIds: ["b"],
  engravingIds: ["c"],
} as const;

test("21 changing the stone clears everything downstream", () => {
  const result = reduceCustomFunnel(filled, { kind: "selectStone", stoneKey: "k2" });
  assert.equal(result.selection.variantId, null);
  assert.deepEqual(result.selection.doriIds, []);
  assert.deepEqual(result.selection.inscriptionIds, []);
  assert.deepEqual(result.selection.engravingIds, []);
  assert.equal(result.clearedDownstream, true);
});

test("22 changing the size clears all options", () => {
  const result = reduceCustomFunnel(filled, { kind: "selectSize", variantId: "v2" });
  assert.deepEqual(result.selection.doriIds, []);
  assert.deepEqual(result.selection.inscriptionIds, []);
  assert.deepEqual(result.selection.engravingIds, []);
  assert.equal(result.selection.stoneKey, "k");
});

test("23 dori, inscription and engraving cascade exactly as contracted", () => {
  const dori = reduceCustomFunnel(filled, { kind: "toggleDori", optionId: "z" });
  assert.deepEqual(dori.selection.doriIds, ["a", "z"]);
  assert.deepEqual(dori.selection.inscriptionIds, []);
  assert.deepEqual(dori.selection.engravingIds, []);

  const ins = reduceCustomFunnel(filled, { kind: "toggleInscription", optionId: "b" });
  assert.deepEqual(ins.selection.doriIds, ["a"]);
  assert.deepEqual(ins.selection.inscriptionIds, []);
  assert.deepEqual(ins.selection.engravingIds, []);

  const eng = reduceCustomFunnel(filled, { kind: "toggleEngraving", optionId: "c" });
  assert.deepEqual(eng.selection.doriIds, ["a"]);
  assert.deepEqual(eng.selection.inscriptionIds, ["b"]);
  assert.deepEqual(eng.selection.engravingIds, []);
  assert.equal(eng.clearedDownstream, false);
});

test("24 the reducer has no step concept, so plain back clears nothing", () => {
  const keys = Object.keys(EMPTY_CUSTOM_FUNNEL_SELECTION);
  assert.deepEqual(keys, ["stoneKey", "variantId", "doriIds", "inscriptionIds", "engravingIds"]);
  assert.ok(!keys.includes("step"));
});

test("25 re-selecting the same value causes no reset and no announcement", () => {
  const stone = reduceCustomFunnel(filled, { kind: "selectStone", stoneKey: "k" });
  assert.equal(stone.changed, false);
  assert.equal(stone.clearedDownstream, false);
  assert.equal(stone.selection, filled);

  const size = reduceCustomFunnel(filled, { kind: "selectSize", variantId: "v" });
  assert.equal(size.changed, false);
  assert.equal(size.selection, filled);
});

const draftProduct = product({
  variants: [
    variant({
      id: "v-s",
      sizeCode: "160x60",
      options: [
        option({ id: "o-d", title: "دوری" }),
        option({ id: "o-i", title: "قطعه" }),
        option({ id: "o-e", title: "حکاکی" }),
        option({ id: "o-x", title: "غیرمرتبط" }),
      ],
    }),
  ],
});

const draftRoles = roles({
  [makeCustomOptionRoleKey("v-s", "o-d")]: "dori",
  [makeCustomOptionRoleKey("v-s", "o-i")]: "inscription_piece",
  [makeCustomOptionRoleKey("v-s", "o-e")]: "engraving",
  [makeCustomOptionRoleKey("v-s", "o-x")]: "excluded",
});

const draftModel = build([draftProduct], draftRoles);
const stoneKey = makeCustomFunnelStoneKey("p-1", "MA-1001");
const baseSelection: CustomFunnelSelection = {
  stoneKey,
  variantId: "v-s",
  doriIds: [] as readonly string[],
  inscriptionIds: [] as readonly string[],
  engravingIds: [] as readonly string[],
};

const makeDraft = (selection: CustomFunnelSelection, catalogVersion: string | null = VERSION) =>
  buildCustomFunnelDraft({ model: draftModel, catalogVersion, selection });

test("26 an invalid catalog version yields a null draft", () => {
  assert.equal(makeDraft(baseSelection, "short"), null);
  assert.equal(makeDraft(baseSelection, null), null);
});

test("27 an incomplete stone or variant yields a null draft", () => {
  assert.equal(makeDraft({ ...baseSelection, stoneKey: null }), null);
  assert.equal(makeDraft({ ...baseSelection, variantId: null }), null);
});

test("28 an unknown option id yields a null draft", () => {
  assert.equal(makeDraft({ ...baseSelection, engravingIds: ["nope"] }), null);
});

test("29 a duplicate option id yields a null draft", () => {
  assert.equal(
    makeDraft({ ...baseSelection, inscriptionIds: ["o-i"], engravingIds: ["o-i"] }),
    null,
  );
});

test("30 an excluded option id yields a null draft", () => {
  assert.equal(makeDraft({ ...baseSelection, engravingIds: ["o-x"] }), null);
});

test("31 an unclassified option id yields a null draft", () => {
  const partialModel = build(
    [draftProduct],
    roles({ ...draftRoles, [makeCustomOptionRoleKey("v-s", "o-x")]: "excluded" }),
  );
  assert.equal(partialModel.stones.length, 1);
  assert.equal(makeDraft({ ...baseSelection, doriIds: ["unknown-option"] }), null);
});

test("32 a dori id used in the wrong stage yields a null draft", () => {
  assert.equal(makeDraft({ ...baseSelection, engravingIds: ["o-d"] }), null);
});

test("33 a valid selection produces the existing GraveStoneRequestDraft", () => {
  const draft = makeDraft({ ...baseSelection, doriIds: ["o-d"], engravingIds: ["o-e"] });
  assert.ok(draft);
  assert.deepEqual(Object.keys(draft).sort(), [...DRAFT_KEYS].sort());
  assert.equal(draft.requestType, "grave_stone");
  assert.equal(draft.variantId, "v-s");
});

test("34 draft option order follows adapter order", () => {
  const draft = makeDraft({
    ...baseSelection,
    engravingIds: ["o-e"],
    inscriptionIds: ["o-i"],
    doriIds: ["o-d"],
  });
  assert.deepEqual(draft!.optionIds, ["o-d", "o-i", "o-e"]);
});

test("35 a custom size always resolves to review with no amount", () => {
  const customProduct = product({
    id: "p-c",
    slug: "c",
    variants: [variant({ id: "v-c", sizeCode: "custom" })],
  });
  const customModel = build([customProduct], {});
  const draft = buildCustomFunnelDraft({
    model: customModel,
    catalogVersion: VERSION,
    selection: {
      stoneKey: makeCustomFunnelStoneKey("p-c", "MA-1001"),
      variantId: "v-c",
      doriIds: [],
      inscriptionIds: [],
      engravingIds: [],
    },
  });
  assert.equal(draft!.displaySnapshot.priceType, "review");
  assert.equal(draft!.displaySnapshot.amountToman, null);
});

test("36 an invalid numeric component resolves to review", () => {
  const badProduct = product({
    id: "p-b",
    slug: "b",
    variants: [variant({ id: "v-b", sizeCode: "160x60", priceUpdatedAt: null })],
  });
  const badModel = build([badProduct], {});
  const draft = buildCustomFunnelDraft({
    model: badModel,
    catalogVersion: VERSION,
    selection: {
      stoneKey: makeCustomFunnelStoneKey("p-b", "MA-1001"),
      variantId: "v-b",
      doriIds: [],
      inscriptionIds: [],
      engravingIds: [],
    },
  });
  assert.equal(draft!.displaySnapshot.priceType, "review");
  assert.equal(draft!.displaySnapshot.amountToman, null);
});

test("37 inputs are never mutated", () => {
  const input = [draftProduct];
  const snapshot = JSON.stringify(input);
  build(input, draftRoles);
  makeDraft({ ...baseSelection, doriIds: ["o-d"] });
  assert.equal(JSON.stringify(input), snapshot);
});

test("38 the draft carries no PII, URL, slug, role or step field", () => {
  const draft = makeDraft({ ...baseSelection, doriIds: ["o-d"] });
  const serialized = JSON.stringify(draft);
  for (const banned of ["slug", "http", "role", "step", "phone", "name", "city", "note"]) {
    assert.ok(!serialized.includes(`"${banned}"`), `draft must not contain ${banned}`);
  }
  assert.deepEqual(CUSTOM_FUNNEL_OPTION_ROLES, {});
});
