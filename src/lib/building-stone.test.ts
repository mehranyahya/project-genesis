import { test } from "node:test";
import assert from "node:assert/strict";

import type { BuildingStoneValues } from "./building-stone";
import {
  BUILDING_STONE_APPLICATION_OPTIONS,
  BUILDING_STONE_FIELD_ERRORS,
  BUILDING_STONE_TYPE_OPTIONS,
  EMPTY_BUILDING_STONE_VALUES,
  buildBuildingStonePayloadFields,
  buildBuildingStoneSummary,
  buildingStoneExtension,
  isBuildingStoneApplication,
  isBuildingStoneType,
  normalizeAreaM2,
  validateBuildingStoneNote,
  validateBuildingStoneSelection,
} from "./building-stone";

const values = (over: Partial<BuildingStoneValues> = {}): BuildingStoneValues => ({
  ...EMPTY_BUILDING_STONE_VALUES,
  stoneType: "marble",
  application: "facade",
  areaM2Input: "",
  ...over,
});

test("1 the initial values are empty and carry no default selection", () => {
  assert.deepEqual(EMPTY_BUILDING_STONE_VALUES, {
    stoneType: null,
    application: null,
    areaM2Input: "",
  });
  assert.deepEqual(buildingStoneExtension.initialValues, EMPTY_BUILDING_STONE_VALUES);
});

test("2 every official stone type is accepted", () => {
  assert.deepEqual(
    BUILDING_STONE_TYPE_OPTIONS.map((option) => option.value),
    ["marble", "granite", "travertine", "crystal"],
  );
  for (const option of BUILDING_STONE_TYPE_OPTIONS) {
    assert.ok(isBuildingStoneType(option.value));
    assert.equal(
      validateBuildingStoneSelection(values({ stoneType: option.value })).errors.stoneType,
      undefined,
    );
  }
});

test("3 a missing or unofficial stone type is rejected", () => {
  assert.ok(!isBuildingStoneType("basalt"));
  assert.ok(!isBuildingStoneType(null));
  const result = validateBuildingStoneSelection(values({ stoneType: null }));
  assert.equal(result.errors.stoneType, BUILDING_STONE_FIELD_ERRORS.stoneType);
  assert.equal(result.firstInvalidField, "stoneType");
  assert.equal(result.selection, null);
});

test("4 every official application is accepted", () => {
  assert.deepEqual(
    BUILDING_STONE_APPLICATION_OPTIONS.map((option) => option.value),
    ["facade", "flooring", "stairs", "interior_wall", "countertop", "other"],
  );
  for (const option of BUILDING_STONE_APPLICATION_OPTIONS) {
    assert.ok(isBuildingStoneApplication(option.value));
  }
});

test("5 a missing or unofficial application is rejected", () => {
  assert.ok(!isBuildingStoneApplication("roof"));
  const result = validateBuildingStoneSelection(values({ application: null }));
  assert.equal(result.errors.application, BUILDING_STONE_FIELD_ERRORS.application);
  assert.equal(result.firstInvalidField, "application");
});

test("6 an empty area is a valid absence", () => {
  assert.deepEqual(normalizeAreaM2(""), { ok: true, value: null });
  assert.deepEqual(normalizeAreaM2("   "), { ok: true, value: null });
  assert.equal(validateBuildingStoneSelection(values()).selection?.area_m2, null);
});

test("7 persian digits are normalized", () => {
  assert.deepEqual(normalizeAreaM2("۱۲۰"), { ok: true, value: 120 });
});

test("8 arabic digits are normalized", () => {
  assert.deepEqual(normalizeAreaM2("١٢٠"), { ok: true, value: 120 });
});

test("9 a latin decimal point is accepted", () => {
  assert.deepEqual(normalizeAreaM2("12.5"), { ok: true, value: 12.5 });
});

test("10 a persian decimal separator is accepted", () => {
  assert.deepEqual(normalizeAreaM2("۱۲٫۵"), { ok: true, value: 12.5 });
});

test("11 zero is rejected", () => {
  assert.deepEqual(normalizeAreaM2("0"), { ok: false });
  assert.deepEqual(normalizeAreaM2("0.000"), { ok: false });
});

test("12 a negative area is rejected", () => {
  assert.deepEqual(normalizeAreaM2("-5"), { ok: false });
  assert.deepEqual(normalizeAreaM2("−5"), { ok: false });
});

test("13 an area above the official maximum is rejected", () => {
  assert.deepEqual(normalizeAreaM2("100000"), { ok: true, value: 100000 });
  assert.deepEqual(normalizeAreaM2("100000.001"), { ok: false });
  assert.deepEqual(normalizeAreaM2("100001"), { ok: false });
});

test("14 scientific notation is rejected", () => {
  for (const input of ["1e3", "1E3", "1e-3", "2.5e2"]) {
    assert.deepEqual(normalizeAreaM2(input), { ok: false }, input);
  }
});

test("15 more than three decimal places is rejected", () => {
  assert.deepEqual(normalizeAreaM2("1.234"), { ok: true, value: 1.234 });
  assert.deepEqual(normalizeAreaM2("1.2345"), { ok: false });
});

test("16 non-numeric input is rejected and reported once", () => {
  for (const input of ["abc", "۱۲ متر", "12/5", "+12", "1.2.3", "."]) {
    assert.deepEqual(normalizeAreaM2(input), { ok: false }, input);
  }
  const result = validateBuildingStoneSelection(values({ areaM2Input: "abc" }));
  assert.equal(result.errors.areaM2, BUILDING_STONE_FIELD_ERRORS.areaM2);
  assert.equal(result.selection, null);
});

test("17 the other application rejects a note shorter than ten characters", () => {
  assert.equal(validateBuildingStoneNote("other", "کوتاه"), BUILDING_STONE_FIELD_ERRORS.otherNote);
  assert.equal(validateBuildingStoneNote("other", "   "), BUILDING_STONE_FIELD_ERRORS.otherNote);
});

test("18 the other application rejects a note longer than five hundred characters", () => {
  assert.equal(
    validateBuildingStoneNote("other", "م".repeat(501)),
    BUILDING_STONE_FIELD_ERRORS.otherNote,
  );
});

test("19 the other application accepts a note inside the official range", () => {
  assert.equal(validateBuildingStoneNote("other", "م".repeat(10)), null);
  assert.equal(validateBuildingStoneNote("other", "م".repeat(500)), null);
});

test("20 a non-other application needs no ten-character note", () => {
  for (const option of BUILDING_STONE_APPLICATION_OPTIONS) {
    if (option.value === "other") continue;
    assert.equal(validateBuildingStoneNote(option.value, ""), null);
    assert.equal(validateBuildingStoneNote(option.value, "کوتاه"), null);
  }
  assert.equal(validateBuildingStoneNote(null, ""), null);
});

test("21 the selection summary contains only stone type, application and area", () => {
  const rows = buildBuildingStoneSummary(values({ areaM2Input: "۱۲۰" }));
  assert.deepEqual(
    rows.map((row) => row.key),
    ["stoneType", "application", "areaM2"],
  );
  assert.deepEqual(
    rows.map((row) => row.value),
    ["مرمریت", "نما", "120"],
  );
  assert.equal(rows[2]?.unit, "متر مربع");
  // Absent or invalid values are omitted, never defaulted.
  assert.deepEqual(buildBuildingStoneSummary(EMPTY_BUILDING_STONE_VALUES), []);
  assert.equal(buildBuildingStoneSummary(values({ areaM2Input: "abc" })).length, 2);
});

test("22 the other description never enters the summary", () => {
  const rows = buildBuildingStoneSummary(values({ application: "other" }));
  const serialized = JSON.stringify(rows);
  assert.ok(!serialized.includes("customerNote"));
  assert.ok(!serialized.includes("customer_note"));
  assert.equal(rows.length, 2);
});

test("23 no helper mutates its input", () => {
  const input = values({ areaM2Input: "۱۲۰" });
  const snapshot = JSON.stringify(input);
  validateBuildingStoneSelection(input);
  buildBuildingStoneSummary(input);
  buildBuildingStonePayloadFields(input);
  normalizeAreaM2(input.areaM2Input);
  assert.equal(JSON.stringify(input), snapshot);
});

test("24 every building-stone request is review with a null amount", () => {
  for (const option of BUILDING_STONE_APPLICATION_OPTIONS) {
    const fields = buildBuildingStonePayloadFields(values({ application: option.value }));
    assert.ok(fields !== null);
    assert.equal(fields.client_price_type, "review");
    assert.equal(fields.client_displayed_price, null);
  }
  assert.deepEqual(buildingStoneExtension.resolvePrice(), {
    priceType: "review",
    amountToman: null,
  });
});

test("25 no area_estimate exists in the model or in the payload fields", () => {
  const fields = buildBuildingStonePayloadFields(values({ areaM2Input: "12.5" }));
  assert.ok(fields !== null);
  assert.equal(fields.area_m2, 12.5);
  assert.ok(!Object.prototype.hasOwnProperty.call(fields, "area_estimate"));
  assert.ok(!JSON.stringify(fields).includes("area_estimate"));
  assert.ok(!Object.keys(EMPTY_BUILDING_STONE_VALUES).includes("area_estimate"));
  assert.ok(!buildingStoneExtension.fields.some((slot) => slot.key === "area_estimate"));
});
