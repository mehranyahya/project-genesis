const HASH_PATTERN = /^[0-9a-f]{64}$/;
const PHONE_PATTERN = /^\+989[0-9]{9}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_TEXT_ID = /^[^\s]{1,160}$/;
const PORTFOLIO_REFERENCE_PATTERN = /^pf-[0-9]{4,}$/;
const PRICE_TYPES = new Set(["fixed", "estimate", "review"]);
const SIZE_CODES = new Set(["120x60", "160x60", "180x60", "custom"]);
const PREFERRED_CONTACTS = new Set(["phone", "whatsapp", "telegram"]);
const STONE_TYPES = new Set(["marble", "granite", "travertine", "crystal"]);
const APPLICATIONS = new Set([
  "facade",
  "flooring",
  "stairs",
  "interior_wall",
  "countertop",
  "other",
]);

const COMMON_KEYS = [
  "submission_id",
  "request_type",
  "customer_name",
  "phone",
  "city",
  "location_text",
  "preferred_contact",
  "preferred_contact_time",
  "customer_note",
  "terms_version",
  "terms_content_hash",
  "terms_accepted",
  "form_fill_duration_ms",
  "honeypot",
  "turnstile_token",
] as const;

const FIELD_ERROR_ALLOWLIST = new Set([
  "customer_name",
  "phone",
  "city",
  "location_text",
  "preferred_contact",
  "preferred_contact_time",
  "customer_note",
  "terms",
]);

export type PriceType = "fixed" | "estimate" | "review";
export type BotVerification = "verified" | "unverified_no_token" | "unverified_service_error";
export type RiskFlag =
  | "shared_ip_volume"
  | "turnstile_no_token"
  | "turnstile_unavailable"
  | "fast_submit_signal"
  | "repeat_phone_short_window";

interface CommonPayload {
  readonly submission_id: string;
  readonly request_type: "grave_stone" | "building_stone" | "contact";
  readonly customer_name: string;
  readonly phone: string;
  readonly city: string | null;
  readonly location_text: string | null;
  readonly preferred_contact: "phone" | "whatsapp" | "telegram";
  readonly preferred_contact_time: string | null;
  readonly customer_note: string | null;
  readonly terms_version: string;
  readonly terms_content_hash: string;
  readonly terms_accepted: true;
}

export interface GraveStonePayload extends CommonPayload {
  readonly request_type: "grave_stone";
  readonly client_catalog_version: string;
  readonly product_id: string;
  readonly product_code: string;
  readonly variant_id: string;
  readonly stone_code: string;
  readonly size_code: "120x60" | "160x60" | "180x60" | "custom";
  readonly option_ids: readonly string[];
  readonly client_price_type: PriceType;
  readonly client_displayed_price: number | null;
}

export interface BuildingStonePayload extends CommonPayload {
  readonly request_type: "building_stone";
  readonly stone_type: "marble" | "granite" | "travertine" | "crystal";
  readonly application: "facade" | "flooring" | "stairs" | "interior_wall" | "countertop" | "other";
  readonly area_m2: number | null;
  readonly client_price_type: "review";
  readonly client_displayed_price: null;
}

export interface ContactPayload extends CommonPayload {
  readonly request_type: "contact";
  readonly source_type?: "portfolio";
  readonly portfolio_reference_id?: string;
}

export type RequestPayload = GraveStonePayload | BuildingStonePayload | ContactPayload;

export interface ParsedRequestEnvelopePayload {
  readonly request: RequestPayload;
  readonly turnstileToken: string | null;
  readonly formFillDurationMs: number | null;
  readonly honeypotFilled: boolean;
}

export type PayloadParseResult =
  | { readonly ok: true; readonly value: ParsedRequestEnvelopePayload }
  | { readonly ok: false; readonly fieldErrors: Readonly<Record<string, true>> };

function own(object: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function exactKeys(object: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(object).every((key) => allowed.has(key));
}

function trimmedString(value: unknown, min: number, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length >= min && trimmed.length <= max && trimmed === value
    ? value
    : null;
}

function nullableTrimmed(value: unknown, max: number): string | null | false {
  if (value === null) return null;
  const parsed = trimmedString(value, 1, max);
  return parsed === null ? false : parsed;
}

function positiveSafeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function fieldError(errors: Record<string, true>, field: string): void {
  if (FIELD_ERROR_ALLOWLIST.has(field)) errors[field] = true;
}

function commonPayload(
  raw: Record<string, unknown>,
  requestType: CommonPayload["request_type"],
  errors: Record<string, true>,
): CommonPayload | null {
  const submissionId =
    typeof raw.submission_id === "string" && UUID_PATTERN.test(raw.submission_id)
      ? raw.submission_id
      : null;
  const customerName = trimmedString(raw.customer_name, 2, 80);
  const phone =
    typeof raw.phone === "string" && PHONE_PATTERN.test(raw.phone) ? raw.phone : null;
  const city = nullableTrimmed(raw.city, 50);
  const locationText = nullableTrimmed(raw.location_text, 200);
  const preferredContact =
    typeof raw.preferred_contact === "string" && PREFERRED_CONTACTS.has(raw.preferred_contact)
      ? (raw.preferred_contact as CommonPayload["preferred_contact"])
      : null;
  const preferredContactTime = nullableTrimmed(raw.preferred_contact_time, 100);
  const customerNote = nullableTrimmed(raw.customer_note, 1000);
  const termsVersion = trimmedString(raw.terms_version, 1, 80);
  const termsHash =
    typeof raw.terms_content_hash === "string" && HASH_PATTERN.test(raw.terms_content_hash)
      ? raw.terms_content_hash
      : null;

  if (customerName === null) fieldError(errors, "customer_name");
  if (phone === null) fieldError(errors, "phone");
  if (city === false || (requestType === "grave_stone" && city === null)) {
    fieldError(errors, "city");
  }
  if (locationText === false || (requestType === "grave_stone" && locationText === null)) {
    fieldError(errors, "location_text");
  }
  if (preferredContact === null) fieldError(errors, "preferred_contact");
  if (preferredContactTime === false) fieldError(errors, "preferred_contact_time");
  if (customerNote === false) fieldError(errors, "customer_note");
  if (termsVersion === null || termsHash === null || raw.terms_accepted !== true) {
    fieldError(errors, "terms");
  }

  if (
    submissionId === null ||
    customerName === null ||
    phone === null ||
    city === false ||
    locationText === false ||
    preferredContact === null ||
    preferredContactTime === false ||
    customerNote === false ||
    termsVersion === null ||
    termsHash === null ||
    raw.terms_accepted !== true
  ) {
    return null;
  }

  return {
    submission_id: submissionId,
    request_type: requestType,
    customer_name: customerName,
    phone,
    city,
    location_text: locationText,
    preferred_contact: preferredContact,
    preferred_contact_time: preferredContactTime,
    customer_note: customerNote,
    terms_version: termsVersion,
    terms_content_hash: termsHash,
    terms_accepted: true,
  };
}

function parseSecurityFields(raw: Record<string, unknown>): {
  turnstileToken: string | null;
  formFillDurationMs: number | null;
  honeypotFilled: boolean;
} | null {
  const token = raw.turnstile_token;
  if (
    token !== null &&
    (typeof token !== "string" || token.length < 1 || token.length > 2048)
  ) {
    return null;
  }

  const duration = raw.form_fill_duration_ms;
  if (
    duration !== undefined &&
    duration !== null &&
    (typeof duration !== "number" ||
      !Number.isSafeInteger(duration) ||
      duration < 0 ||
      duration > 86_400_000)
  ) {
    return null;
  }

  const honeypot = raw.honeypot;
  if (
    honeypot !== undefined &&
    (typeof honeypot !== "string" || honeypot.length > 200)
  ) {
    return null;
  }

  return {
    turnstileToken: token as string | null,
    formFillDurationMs: typeof duration === "number" ? duration : null,
    honeypotFilled: typeof honeypot === "string" && honeypot.trim() !== "",
  };
}

export function parseRequestPayload(value: unknown): PayloadParseResult {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, fieldErrors: {} };
  }
  const raw = value as Record<string, unknown>;
  const requestType = raw.request_type;
  if (
    requestType !== "grave_stone" &&
    requestType !== "building_stone" &&
    requestType !== "contact"
  ) {
    return { ok: false, fieldErrors: {} };
  }

  const security = parseSecurityFields(raw);
  if (security === null) return { ok: false, fieldErrors: {} };

  const errors: Record<string, true> = {};
  const common = commonPayload(raw, requestType, errors);
  if (common === null) return { ok: false, fieldErrors: errors };

  if (requestType === "grave_stone") {
    const allowed = new Set([
      ...COMMON_KEYS,
      "client_catalog_version",
      "product_id",
      "product_code",
      "variant_id",
      "stone_code",
      "size_code",
      "option_ids",
      "client_price_type",
      "client_displayed_price",
    ]);
    if (!exactKeys(raw, allowed)) return { ok: false, fieldErrors: {} };
    if (
      typeof raw.client_catalog_version !== "string" ||
      !HASH_PATTERN.test(raw.client_catalog_version) ||
      typeof raw.product_id !== "string" ||
      !SAFE_TEXT_ID.test(raw.product_id) ||
      trimmedString(raw.product_code, 1, 80) === null ||
      typeof raw.variant_id !== "string" ||
      !SAFE_TEXT_ID.test(raw.variant_id) ||
      trimmedString(raw.stone_code, 1, 80) === null ||
      typeof raw.size_code !== "string" ||
      !SIZE_CODES.has(raw.size_code) ||
      !Array.isArray(raw.option_ids) ||
      raw.option_ids.length > 32 ||
      !raw.option_ids.every((id) => typeof id === "string" && SAFE_TEXT_ID.test(id)) ||
      typeof raw.client_price_type !== "string" ||
      !PRICE_TYPES.has(raw.client_price_type)
    ) {
      return { ok: false, fieldErrors: {} };
    }

    const priceType = raw.client_price_type as PriceType;
    const amount = raw.client_displayed_price;
    const validAmount =
      (priceType === "review" && amount === null) ||
      (priceType !== "review" && positiveSafeInteger(amount) !== null);
    if (!validAmount) return { ok: false, fieldErrors: {} };

    const request: GraveStonePayload = {
      ...common,
      request_type: "grave_stone",
      client_catalog_version: raw.client_catalog_version,
      product_id: raw.product_id,
      product_code: raw.product_code as string,
      variant_id: raw.variant_id,
      stone_code: raw.stone_code as string,
      size_code: raw.size_code as GraveStonePayload["size_code"],
      option_ids: raw.option_ids as string[],
      client_price_type: priceType,
      client_displayed_price: amount as number | null,
    };
    return { ok: true, value: { request, ...security } };
  }

  if (requestType === "building_stone") {
    const allowed = new Set([
      ...COMMON_KEYS,
      "stone_type",
      "application",
      "area_m2",
      "client_price_type",
      "client_displayed_price",
    ]);
    if (!exactKeys(raw, allowed)) return { ok: false, fieldErrors: {} };
    if (
      typeof raw.stone_type !== "string" ||
      !STONE_TYPES.has(raw.stone_type) ||
      typeof raw.application !== "string" ||
      !APPLICATIONS.has(raw.application) ||
      raw.client_price_type !== "review" ||
      raw.client_displayed_price !== null
    ) {
      return { ok: false, fieldErrors: {} };
    }
    const area = raw.area_m2;
    if (
      area !== null &&
      (typeof area !== "number" ||
        !Number.isFinite(area) ||
        area <= 0 ||
        area > 100_000 ||
        !Number.isInteger(area * 1000))
    ) {
      return { ok: false, fieldErrors: {} };
    }
    if (
      raw.application === "other" &&
      (common.customer_note === null ||
        common.customer_note.length < 10 ||
        common.customer_note.length > 500)
    ) {
      fieldError(errors, "customer_note");
      return { ok: false, fieldErrors: errors };
    }

    const request: BuildingStonePayload = {
      ...common,
      request_type: "building_stone",
      stone_type: raw.stone_type as BuildingStonePayload["stone_type"],
      application: raw.application as BuildingStonePayload["application"],
      area_m2: area as number | null,
      client_price_type: "review",
      client_displayed_price: null,
    };
    return { ok: true, value: { request, ...security } };
  }

  const allowed = new Set([...COMMON_KEYS, "source_type", "portfolio_reference_id"]);
  if (!exactKeys(raw, allowed)) return { ok: false, fieldErrors: {} };
  const hasSource = own(raw, "source_type") || own(raw, "portfolio_reference_id");
  if (hasSource) {
    if (
      raw.source_type !== "portfolio" ||
      typeof raw.portfolio_reference_id !== "string" ||
      !PORTFOLIO_REFERENCE_PATTERN.test(raw.portfolio_reference_id)
    ) {
      return { ok: false, fieldErrors: {} };
    }
    const request: ContactPayload = {
      ...common,
      request_type: "contact",
      source_type: "portfolio",
      portfolio_reference_id: raw.portfolio_reference_id,
    };
    return { ok: true, value: { request, ...security } };
  }

  return {
    ok: true,
    value: { request: { ...common, request_type: "contact" }, ...security },
  };
}
