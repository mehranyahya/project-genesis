/**
 * Pure building-stone request contract.
 *
 * No React, no DOM, no storage, no network, no clock. Every helper derives its
 * result from its arguments and never mutates them. Nothing here fabricates a
 * price: a building-stone request is always a review request in this phase.
 */

import type { BuildingStoneApplication, BuildingStoneType, PriceType } from "./content/types";

/* -------------------------------------------------------------------------- */
/* Options and labels                                                          */
/* -------------------------------------------------------------------------- */

export interface BuildingStoneOption<TValue extends string> {
  readonly value: TValue;
  readonly label: string;
}

export const BUILDING_STONE_TYPE_OPTIONS: readonly BuildingStoneOption<BuildingStoneType>[] = [
  { value: "marble", label: "مرمریت" },
  { value: "granite", label: "گرانیت" },
  { value: "travertine", label: "تراورتن" },
  { value: "crystal", label: "کریستال" },
];

export const BUILDING_STONE_APPLICATION_OPTIONS: readonly BuildingStoneOption<BuildingStoneApplication>[] =
  [
    { value: "facade", label: "نما" },
    { value: "flooring", label: "کف" },
    { value: "stairs", label: "پله" },
    { value: "interior_wall", label: "دیوار داخلی" },
    { value: "countertop", label: "صفحه کابینت" },
    { value: "other", label: "سایر" },
  ];

export const BUILDING_STONE_TYPE_LABELS: Readonly<Record<BuildingStoneType, string>> = {
  marble: "مرمریت",
  granite: "گرانیت",
  travertine: "تراورتن",
  crystal: "کریستال",
};

export const BUILDING_STONE_APPLICATION_LABELS: Readonly<Record<BuildingStoneApplication, string>> =
  {
    facade: "نما",
    flooring: "کف",
    stairs: "پله",
    interior_wall: "دیوار داخلی",
    countertop: "صفحه کابینت",
    other: "سایر",
  };

export function isBuildingStoneType(value: unknown): value is BuildingStoneType {
  return BUILDING_STONE_TYPE_OPTIONS.some((option) => option.value === value);
}

export function isBuildingStoneApplication(value: unknown): value is BuildingStoneApplication {
  return BUILDING_STONE_APPLICATION_OPTIONS.some((option) => option.value === value);
}

/* -------------------------------------------------------------------------- */
/* Values                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The raw UI contract. There is deliberately no separate field for the "other"
 * description: it is entered in the shared `customerNote` field so the payload
 * carries it exactly once, in `customer_note`.
 */
export interface BuildingStoneValues {
  readonly stoneType: BuildingStoneType | null;
  readonly application: BuildingStoneApplication | null;
  readonly areaM2Input: string;
}

export const EMPTY_BUILDING_STONE_VALUES: BuildingStoneValues = {
  stoneType: null,
  application: null,
  areaM2Input: "",
};

export type BuildingStoneFieldKey = "stoneType" | "application" | "areaM2";

export const BUILDING_STONE_FIELD_ORDER: readonly BuildingStoneFieldKey[] = [
  "stoneType",
  "application",
  "areaM2",
];

export const BUILDING_STONE_FIELD_LABELS: Readonly<Record<BuildingStoneFieldKey, string>> = {
  stoneType: "نوع سنگ",
  application: "کاربرد",
  areaM2: "مساحت به متر مربع — اختیاری",
};

export const BUILDING_STONE_LEGENDS = {
  stoneType: "نوع سنگ",
  application: "کاربرد",
} as const;

export const BUILDING_STONE_AREA_UNIT = "متر مربع";

export const BUILDING_STONE_OTHER_HELPER =
  "برای کاربرد «سایر»، توضیح را در بخش توضیح کوتاه وارد کنید.";

export const BUILDING_STONE_FIELD_ERRORS = {
  stoneType: "نوع سنگ را انتخاب کنید.",
  application: "کاربرد سنگ را انتخاب کنید.",
  areaM2: "مساحت باید عددی بیشتر از صفر و حداکثر ۱۰۰٬۰۰۰ متر مربع باشد.",
  otherNote: "برای کاربرد «سایر»، توضیحی بین ۱۰ تا ۵۰۰ نویسه وارد کنید.",
} as const;

export type BuildingStoneFieldErrors = Readonly<Partial<Record<BuildingStoneFieldKey, string>>>;

/* -------------------------------------------------------------------------- */
/* Area normalization                                                          */
/* -------------------------------------------------------------------------- */

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** Latinizes Persian and Arabic-Indic digits; every other character survives. */
export function toLatinDigits(value: string): string {
  let out = "";
  for (const char of value) {
    const persian = PERSIAN_DIGITS.indexOf(char);
    if (persian >= 0) {
      out += String(persian);
      continue;
    }
    const arabic = ARABIC_DIGITS.indexOf(char);
    if (arabic >= 0) {
      out += String(arabic);
      continue;
    }
    out += char;
  }
  return out;
}

export type AreaNormalization =
  { readonly ok: true; readonly value: number | null } | { readonly ok: false };

/** Plain decimal only: no sign, no exponent, at most three decimal places. */
const AREA_PATTERN = /^[0-9]+(\.[0-9]{1,3})?$/;

export const BUILDING_STONE_AREA_MAX = 100000;

/**
 * Normalizes the optional area input.
 *
 * Empty input is a valid absence (`null`). Persian, Arabic and Latin digits are
 * accepted, both `.` and `٫` are decimal separators, and purely visual grouping
 * characters are dropped only when the remainder is an unambiguous decimal.
 * Scientific notation, signs, zero, negatives and more than three decimals are
 * rejected, and the result must fall inside `(0, 100000]`.
 */
export function normalizeAreaM2(input: string): AreaNormalization {
  if (typeof input !== "string") return { ok: false };
  const raw = input.trim();
  if (raw.length === 0) return { ok: true, value: null };

  const latin = toLatinDigits(raw).replace(/٫/g, ".");
  const compact = latin.replace(/[\s\u00a0\u200c\u066c,]/g, "");
  if (!AREA_PATTERN.test(compact)) return { ok: false };

  const value = Number(compact);
  if (!Number.isFinite(value)) return { ok: false };
  if (value <= 0 || value > BUILDING_STONE_AREA_MAX) return { ok: false };
  return { ok: true, value };
}

/* -------------------------------------------------------------------------- */
/* Selection validation                                                        */
/* -------------------------------------------------------------------------- */

export interface BuildingStoneNormalizedSelection {
  readonly stone_type: BuildingStoneType;
  readonly application: BuildingStoneApplication;
  readonly area_m2: number | null;
}

export interface BuildingStoneValidation {
  readonly valid: boolean;
  readonly errors: BuildingStoneFieldErrors;
  readonly firstInvalidField: BuildingStoneFieldKey | null;
  readonly selection: BuildingStoneNormalizedSelection | null;
}

export function validateBuildingStoneSelection(
  values: BuildingStoneValues,
): BuildingStoneValidation {
  const errors: Partial<Record<BuildingStoneFieldKey, string>> = {};

  const stoneType = isBuildingStoneType(values.stoneType) ? values.stoneType : null;
  if (stoneType === null) errors.stoneType = BUILDING_STONE_FIELD_ERRORS.stoneType;

  const application = isBuildingStoneApplication(values.application) ? values.application : null;
  if (application === null) errors.application = BUILDING_STONE_FIELD_ERRORS.application;

  const area = normalizeAreaM2(values.areaM2Input);
  if (!area.ok) errors.areaM2 = BUILDING_STONE_FIELD_ERRORS.areaM2;

  const firstInvalidField =
    BUILDING_STONE_FIELD_ORDER.find((key) => errors[key] !== undefined) ?? null;
  const valid = firstInvalidField === null;

  return {
    valid,
    errors,
    firstInvalidField,
    selection:
      valid && stoneType !== null && application !== null && area.ok
        ? { stone_type: stoneType, application, area_m2: area.value }
        : null,
  };
}

export const BUILDING_STONE_OTHER_NOTE_MIN = 10;
export const BUILDING_STONE_OTHER_NOTE_MAX = 500;

/**
 * The "other" application requires a real description in the shared note field.
 * Every other application keeps the generic shared-note contract untouched.
 */
export function validateBuildingStoneNote(
  application: BuildingStoneApplication | null,
  customerNote: string,
): string | null {
  if (application !== "other") return null;
  const note = typeof customerNote === "string" ? customerNote.trim() : "";
  if (note.length < BUILDING_STONE_OTHER_NOTE_MIN || note.length > BUILDING_STONE_OTHER_NOTE_MAX) {
    return BUILDING_STONE_FIELD_ERRORS.otherNote;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Selection summary                                                           */
/* -------------------------------------------------------------------------- */

export interface BuildingStoneSummaryRow {
  readonly key: BuildingStoneFieldKey;
  readonly label: string;
  readonly value: string;
  readonly unit: string | null;
  readonly latin: boolean;
}

export const BUILDING_STONE_SUMMARY_HEADING = "خلاصهٔ انتخاب";

/**
 * Only present, valid, non-personal selection values. Nothing is defaulted and
 * nothing is fabricated; the "other" description never appears here.
 */
export function buildBuildingStoneSummary(
  values: BuildingStoneValues,
): readonly BuildingStoneSummaryRow[] {
  const rows: BuildingStoneSummaryRow[] = [];

  if (isBuildingStoneType(values.stoneType)) {
    rows.push({
      key: "stoneType",
      label: BUILDING_STONE_LEGENDS.stoneType,
      value: BUILDING_STONE_TYPE_LABELS[values.stoneType],
      unit: null,
      latin: false,
    });
  }

  if (isBuildingStoneApplication(values.application)) {
    rows.push({
      key: "application",
      label: BUILDING_STONE_LEGENDS.application,
      value: BUILDING_STONE_APPLICATION_LABELS[values.application],
      unit: null,
      latin: false,
    });
  }

  const area = normalizeAreaM2(values.areaM2Input);
  if (area.ok && area.value !== null) {
    rows.push({
      key: "areaM2",
      label: "مساحت",
      value: String(area.value),
      unit: BUILDING_STONE_AREA_UNIT,
      latin: true,
    });
  }

  return rows;
}

/* -------------------------------------------------------------------------- */
/* Payload extension                                                           */
/* -------------------------------------------------------------------------- */

export interface BuildingStonePayloadFields {
  readonly stone_type: BuildingStoneType;
  readonly application: BuildingStoneApplication;
  readonly area_m2: number | null;
  readonly client_price_type: "review";
  readonly client_displayed_price: null;
}

/** The selection part of the payload; never a numeric price. */
export function buildBuildingStonePayloadFields(
  values: BuildingStoneValues,
): BuildingStonePayloadFields | null {
  const validation = validateBuildingStoneSelection(values);
  if (validation.selection === null) return null;
  return {
    ...validation.selection,
    client_price_type: "review",
    client_displayed_price: null,
  };
}

export const BUILDING_STONE_PRICE: {
  readonly priceType: PriceType;
  readonly amountToman: number | null;
} = { priceType: "review", amountToman: null };

/**
 * The concrete, type-safe extension consumed by the shared request form. It is
 * a plain data object: no React, no JSX, no runtime dependency on the UI.
 */
export const buildingStoneExtension = {
  kind: "building_stone",
  fields: [
    { key: "stoneType", label: BUILDING_STONE_FIELD_LABELS.stoneType, required: true },
    { key: "application", label: BUILDING_STONE_FIELD_LABELS.application, required: true },
    { key: "areaM2", label: BUILDING_STONE_FIELD_LABELS.areaM2, required: false },
  ],
  initialValues: EMPTY_BUILDING_STONE_VALUES,
  validate: (values: BuildingStoneValues): Readonly<Record<string, string>> =>
    validateBuildingStoneSelection(values).errors as Readonly<Record<string, string>>,
  buildPayload: buildBuildingStonePayloadFields,
  resolvePrice: () => BUILDING_STONE_PRICE,
} as const;

/* -------------------------------------------------------------------------- */
/* Field identifiers                                                           */
/* -------------------------------------------------------------------------- */

export const BUILDING_STONE_FIELD_ID_PREFIX = "building-stone";

/** Stable, focusable DOM ids shared by the fields and the focus logic. */
export const buildingStoneFieldId = (key: string) => `${BUILDING_STONE_FIELD_ID_PREFIX}-${key}`;
export const buildingStoneErrorId = (key: string) =>
  `${BUILDING_STONE_FIELD_ID_PREFIX}-${key}-error`;
