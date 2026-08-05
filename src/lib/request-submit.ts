/**
 * Same-origin submit contract for the shared request form.
 *
 * The transport is injectable so tests can exercise every state without a real
 * backend. No absolute URL, no external key, no fake success.
 */

import type { PriceType } from "./content/types";
import type { RequestFieldKey, RequestPayload, RequestTermsDocument } from "./request-form";
import { isRequestTermsDocument } from "./request-form";

export const SUBMIT_ENDPOINT = "/api/submit-request";
export const SUBMIT_TIMEOUT_MS = 15000;

export const TRACKING_CODE_PATTERN = /^MA-[1-9][0-9]{3,}$/;

export function isTrackingCode(value: unknown): value is string {
  return typeof value === "string" && TRACKING_CODE_PATTERN.test(value);
}

export const RESPONSE_CODES = [
  "REQUEST_CREATED",
  "REQUEST_REPLAYED",
  "PRICE_CHANGED",
  "SELECTION_UNAVAILABLE",
  "TERMS_UPDATED",
  "IDEMPOTENCY_CONFLICT",
  "IDEMPOTENCY_EXPIRED",
  "VALIDATION_ERROR",
  "BOT_VERIFICATION_INVALID",
  "RATE_LIMITED",
  "TEMPORARILY_UNAVAILABLE",
] as const;

export type ResponseCode = (typeof RESPONSE_CODES)[number];

/* -------------------------------------------------------------------------- */
/* Transport                                                                   */
/* -------------------------------------------------------------------------- */

export interface RequestSubmitTransportInput {
  readonly url: string;
  readonly method: "POST";
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
  readonly cache: "no-store";
  readonly signal: AbortSignal;
}

export interface RequestSubmitTransportResult {
  readonly status: number;
  readonly body: string;
}

export type RequestSubmitTransport = (
  input: RequestSubmitTransportInput,
) => Promise<RequestSubmitTransportResult>;

export const sameOriginTransport: RequestSubmitTransport = async (input) => {
  const response = await fetch(input.url, {
    method: input.method,
    headers: { ...input.headers },
    body: input.body,
    cache: input.cache,
    signal: input.signal,
  });
  const body = await response.text();
  return { status: response.status, body };
};

/* -------------------------------------------------------------------------- */
/* Outcomes                                                                    */
/* -------------------------------------------------------------------------- */

export interface SubmitPrice {
  readonly priceType: PriceType;
  readonly amountToman: number | null;
}

export type SubmitOutcome =
  | { readonly kind: "success"; readonly trackingCode: string; readonly replayed: boolean }
  | { readonly kind: "price_changed"; readonly price: SubmitPrice }
  | { readonly kind: "selection_unavailable" }
  | { readonly kind: "terms_updated"; readonly termsDocument: RequestTermsDocument | null }
  | { readonly kind: "idempotency_conflict" }
  | { readonly kind: "idempotency_expired" }
  | {
      readonly kind: "validation_error";
      readonly fieldErrors: Readonly<Partial<Record<RequestFieldKey, string>>>;
    }
  | { readonly kind: "bot_verification_invalid" }
  | { readonly kind: "rate_limited" }
  | { readonly kind: "temporarily_unavailable" };

export const SUBMIT_MESSAGES = {
  price_changed:
    "قیمت یا وضعیت بررسی سفارش تغییر کرده است. مقدار تازه را بررسی و برای ارسال دوباره تأیید کنید.",
  price_changed_action: "تأیید مقدار تازه و ارسال دوباره",
  selection_unavailable: "بخشی از انتخاب فعلی دیگر در دسترس نیست. انتخاب را بازبینی کنید.",
  terms_updated: "شرایط ثبت به‌روزرسانی شده است. شرایط را دوباره بررسی و تأیید کنید.",
  idempotency: "شناسهٔ ارسال قبلی دیگر قابل استفاده نیست. برای تلاش بعدی شناسهٔ تازه ساخته می‌شود.",
  validation_error: "اطلاعات فرم نیاز به اصلاح دارد.",
  bot_verification_invalid: "اعتبارسنجی امنیتی کامل نشد. دوباره تلاش کنید.",
  rate_limited: "تعداد تلاش‌ها بیش از حد مجاز است. ۱۰ دقیقه بعد دوباره تلاش کنید.",
  temporarily_unavailable:
    "ثبت درخواست در حال حاضر ممکن نیست. اطلاعات شما در همین صفحه حفظ شده است؛ دوباره تلاش کنید.",
  retry_action: "تلاش دوباره",
  submitting: "در حال ارسال درخواست",
} as const;

const TEMPORARY: SubmitOutcome = { kind: "temporarily_unavailable" };

/* -------------------------------------------------------------------------- */
/* Submission id                                                               */
/* -------------------------------------------------------------------------- */

export function createSubmissionId(): string {
  return crypto.randomUUID();
}

/* -------------------------------------------------------------------------- */
/* Server field mapping                                                        */
/* -------------------------------------------------------------------------- */

const SERVER_FIELDS: Readonly<Record<string, RequestFieldKey>> = {
  customer_name: "customerName",
  phone: "phone",
  city: "city",
  location_text: "locationText",
  preferred_contact: "preferredContact",
  preferred_contact_time: "preferredContactTime",
  customer_note: "customerNote",
  terms: "termsAccepted",
};

function mapFieldErrors(value: unknown): Readonly<Partial<Record<RequestFieldKey, string>>> {
  if (typeof value !== "object" || value === null) return {};
  const out: Partial<Record<RequestFieldKey, string>> = {};
  for (const [key, message] of Object.entries(value as Record<string, unknown>)) {
    const field = SERVER_FIELDS[key];
    if (field === undefined) continue;
    if (typeof message !== "string" || message.trim().length === 0) continue;
    out[field] = message.trim();
  }
  return out;
}

function readPrice(value: unknown): SubmitPrice | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as { price_type?: unknown; amount_toman?: unknown };
  const type = candidate.price_type;
  if (type !== "fixed" && type !== "estimate" && type !== "review") return null;
  const amount = candidate.amount_toman;
  if (type === "review") return { priceType: "review", amountToman: null };
  if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount <= 0) return null;
  return { priceType: type, amountToman: amount };
}

function readTerms(value: unknown): RequestTermsDocument | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as { version?: unknown; content_hash?: unknown };
  const next = { version: candidate.version, contentHash: candidate.content_hash };
  return isRequestTermsDocument(next) ? next : null;
}

/* -------------------------------------------------------------------------- */
/* Response interpretation                                                     */
/* -------------------------------------------------------------------------- */

export function interpretSubmitResponse(result: RequestSubmitTransportResult): SubmitOutcome {
  const raw = typeof result.body === "string" ? result.body.trim() : "";
  if (raw.length === 0) return TEMPORARY;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return TEMPORARY;
  }
  if (typeof parsed !== "object" || parsed === null) return TEMPORARY;

  const body = parsed as Record<string, unknown>;
  const code = body['code'];
  if (typeof code !== "string" || !(RESPONSE_CODES as readonly string[]).includes(code)) {
    return TEMPORARY;
  }

  const status = result.status;

  switch (code as ResponseCode) {
    case "REQUEST_CREATED":
    case "REQUEST_REPLAYED": {
      const expected = code === "REQUEST_CREATED" ? 201 : 200;
      if (status !== expected) return TEMPORARY;
      const tracking = body['tracking_code'];
      if (!isTrackingCode(tracking)) return TEMPORARY;
      return { kind: "success", trackingCode: tracking, replayed: code === "REQUEST_REPLAYED" };
    }
    case "PRICE_CHANGED": {
      if (status !== 409) return TEMPORARY;
      const price = readPrice(body['price']);
      return { kind: "price_changed", price: price ?? { priceType: "review", amountToman: null } };
    }
    case "SELECTION_UNAVAILABLE":
      return status === 409 ? { kind: "selection_unavailable" } : TEMPORARY;
    case "TERMS_UPDATED":
      return status === 409
        ? { kind: "terms_updated", termsDocument: readTerms(body['terms']) }
        : TEMPORARY;
    case "IDEMPOTENCY_CONFLICT":
      return status === 409 ? { kind: "idempotency_conflict" } : TEMPORARY;
    case "IDEMPOTENCY_EXPIRED":
      return status === 409 ? { kind: "idempotency_expired" } : TEMPORARY;
    case "VALIDATION_ERROR":
      return status === 422
        ? { kind: "validation_error", fieldErrors: mapFieldErrors(body['field_errors']) }
        : TEMPORARY;
    case "BOT_VERIFICATION_INVALID":
      return status === 422 ? { kind: "bot_verification_invalid" } : TEMPORARY;
    case "RATE_LIMITED":
      return status === 429 ? { kind: "rate_limited" } : TEMPORARY;
    case "TEMPORARILY_UNAVAILABLE":
    default:
      return TEMPORARY;
  }
}

/* -------------------------------------------------------------------------- */
/* Submit                                                                      */
/* -------------------------------------------------------------------------- */

export async function submitRequest(input: {
  readonly payload: RequestPayload;
  readonly transport?: RequestSubmitTransport;
  readonly timeoutMs?: number;
}): Promise<SubmitOutcome> {
  const transport = input.transport ?? sameOriginTransport;
  const timeoutMs = input.timeoutMs ?? SUBMIT_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const result = await transport({
      url: SUBMIT_ENDPOINT,
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(input.payload),
      cache: "no-store",
      signal: controller.signal,
    });
    return interpretSubmitResponse(result);
  } catch {
    return TEMPORARY;
  } finally {
    clearTimeout(timer);
  }
}

/* -------------------------------------------------------------------------- */
/* Tracking code memory                                                        */
/* -------------------------------------------------------------------------- */

export const TRACKING_STORAGE_KEY = "mehrara:last-tracking-code";

/** Stores the tracking code only. A storage failure never breaks success. */
export function rememberTrackingCode(code: string): void {
  if (!isTrackingCode(code)) return;
  try {
    if (typeof sessionStorage === "undefined") return;
    sessionStorage.setItem(TRACKING_STORAGE_KEY, code);
  } catch {
    /* storage is optional */
  }
}
