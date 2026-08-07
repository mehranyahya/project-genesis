import { createHmac } from "node:crypto";
import { isIP } from "node:net";

import { z } from "zod";

import { getRequestTermsDocument } from "./request-terms";

const MAX_BODY_BYTES = 16 * 1024;
const RPC_TIMEOUT_MS = 10_000;
const RATE_LIMIT_RETRY_SECONDS = 600;

const HASH_PATTERN = /^[0-9a-f]{64}$/;
const PHONE_PATTERN = /^\+989[0-9]{9}$/;
const TRACKING_PATTERN = /^MA-[1-9][0-9]{3,}$/;
const PORTFOLIO_REFERENCE_PATTERN = /^pf-[0-9]{4,}$/;
const SAFE_TEXT_ID = /^[^\s]{1,160}$/;

const preferredContactSchema = z.enum(["phone", "whatsapp", "telegram"]);
const priceTypeSchema = z.enum(["fixed", "estimate", "review"]);
const sizeCodeSchema = z.enum(["120x60", "160x60", "180x60", "custom"]);

const nullableText = (max: number) => z.string().trim().min(1).max(max).nullable();

const commonSchema = z.object({
  submission_id: z.string().uuid(),
  customer_name: z.string().trim().min(2).max(80),
  phone: z.string().regex(PHONE_PATTERN),
  city: nullableText(50),
  location_text: nullableText(200),
  preferred_contact: preferredContactSchema,
  preferred_contact_time: nullableText(100),
  customer_note: nullableText(1000),
  terms_version: z.string().trim().min(1).max(80),
  terms_content_hash: z.string().regex(HASH_PATTERN),
  terms_accepted: z.literal(true),
});

const numericPriceSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

const graveStoneSchema = commonSchema
  .extend({
    request_type: z.literal("grave_stone"),
    client_catalog_version: z.string().regex(HASH_PATTERN),
    product_id: z.string().regex(SAFE_TEXT_ID),
    product_code: z.string().trim().min(1).max(80),
    variant_id: z.string().regex(SAFE_TEXT_ID),
    stone_code: z.string().trim().min(1).max(80),
    size_code: sizeCodeSchema,
    option_ids: z.array(z.string().regex(SAFE_TEXT_ID)).max(32),
    client_price_type: priceTypeSchema,
    client_displayed_price: numericPriceSchema.nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    const validReview =
      value.client_price_type === "review" && value.client_displayed_price === null;
    const validNumeric =
      value.client_price_type !== "review" && value.client_displayed_price !== null;
    if (!validReview && !validNumeric) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["client_displayed_price"],
        message: "Invalid client price shape",
      });
    }
  });

const areaSchema = z
  .number()
  .positive()
  .max(100_000)
  .refine((value) => Number.isInteger(value * 1000), "Area supports at most three decimals")
  .nullable();

const buildingStoneSchema = commonSchema
  .extend({
    request_type: z.literal("building_stone"),
    stone_type: z.enum(["marble", "granite", "travertine", "crystal"]),
    application: z.enum(["facade", "flooring", "stairs", "interior_wall", "countertop", "other"]),
    area_m2: areaSchema,
    client_price_type: z.literal("review"),
    client_displayed_price: z.null(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.application === "other" &&
      (value.customer_note === null ||
        value.customer_note.length < 10 ||
        value.customer_note.length > 500)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customer_note"],
        message: "Other application requires a bounded note",
      });
    }
  });

const contactSchema = commonSchema
  .extend({
    request_type: z.literal("contact"),
    source_type: z.literal("portfolio").optional(),
    portfolio_reference_id: z.string().regex(PORTFOLIO_REFERENCE_PATTERN).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.source_type === undefined) !== (value.portfolio_reference_id === undefined)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["portfolio_reference_id"],
        message: "Portfolio referral fields must appear together",
      });
    }
  });

const requestPayloadSchema = z.union([graveStoneSchema, buildingStoneSchema, contactSchema]);

export type ServerRequestPayload = z.infer<typeof requestPayloadSchema>;

export type RiskFlag =
  | "shared_ip_volume"
  | "turnstile_no_token"
  | "turnstile_unavailable"
  | "fast_submit_signal"
  | "repeat_phone_short_window";
export type BotVerification = "verified" | "unverified_no_token" | "unverified_service_error";

export interface RequestSecurityContext {
  readonly botVerification: BotVerification;
  readonly riskFlags: readonly RiskFlag[];
}

const DEFAULT_SECURITY_CONTEXT: RequestSecurityContext = {
  botVerification: "unverified_no_token",
  riskFlags: ["turnstile_no_token"],
};

export interface RequestApiConfig {
  readonly supabaseUrl: string;
  readonly serviceRoleKey: string;
  readonly fingerprintKey: string;
  readonly fingerprintKeyId: string;
  readonly ipHashKey: string;
}

export interface RpcInput {
  readonly p_payload: ServerRequestPayload;
  readonly p_request_fingerprint: string;
  readonly p_request_fingerprint_key_id: string;
  readonly p_current_terms_version: string | null;
  readonly p_current_terms_hash: string | null;
  readonly p_bot_verification: BotVerification;
  readonly p_risk_flags: readonly RiskFlag[];
  readonly p_ip_hash: string | null;
}

const rpcPriceSchema = z.union([
  z.object({ price_type: z.literal("review"), amount_toman: z.null() }).strict(),
  z
    .object({
      price_type: z.enum(["fixed", "estimate"]),
      amount_toman: numericPriceSchema,
    })
    .strict(),
]);

const rpcTermsSchema = z
  .object({
    version: z.string().trim().min(1).max(80),
    content_hash: z.string().regex(HASH_PATTERN),
  })
  .strict();

const rpcResultSchema = z.union([
  z
    .object({
      code: z.enum(["REQUEST_CREATED", "REQUEST_REPLAYED"]),
      tracking_code: z.string().regex(TRACKING_PATTERN),
    })
    .strict(),
  z.object({ code: z.literal("PRICE_CHANGED"), price: rpcPriceSchema }).strict(),
  z.object({ code: z.literal("TERMS_UPDATED"), terms: rpcTermsSchema }).strict(),
  z
    .object({
      code: z.literal("VALIDATION_ERROR"),
      field_errors: z.record(z.unknown()),
    })
    .strict(),
  z
    .object({
      code: z.enum([
        "SELECTION_UNAVAILABLE",
        "IDEMPOTENCY_CONFLICT",
        "IDEMPOTENCY_EXPIRED",
        "RATE_LIMITED",
        "TEMPORARILY_UNAVAILABLE",
      ]),
    })
    .strict(),
]);

export type RequestRpcResult = z.infer<typeof rpcResultSchema>;

const SERVER_FIELD_NAMES = new Set([
  "customer_name",
  "phone",
  "city",
  "location_text",
  "preferred_contact",
  "preferred_contact_time",
  "customer_note",
  "terms",
]);

function readConfig(): RequestApiConfig {
  const env = process.env as Record<string, string | undefined>;
  const rawUrl = env["SUPABASE_URL"]?.trim();
  const serviceRoleKey = env["SUPABASE_SERVICE_ROLE_KEY"]?.trim();
  const fingerprintKey = env["REQUEST_FINGERPRINT_KEY"]?.trim();
  const fingerprintKeyId = env["REQUEST_FINGERPRINT_KEY_ID"]?.trim();
  const ipHashKey = env["IP_HASH_KEY"]?.trim();

  if (
    !rawUrl ||
    !serviceRoleKey ||
    !fingerprintKey ||
    fingerprintKey.length < 32 ||
    !fingerprintKeyId ||
    !/^[A-Za-z0-9._-]{1,64}$/.test(fingerprintKeyId) ||
    !ipHashKey ||
    ipHashKey.length < 32
  ) {
    throw new Error("Request API configuration is incomplete");
  }

  const parsed = new URL(rawUrl);
  if (parsed.protocol !== "https:") throw new Error("SUPABASE_URL must use https");

  return {
    supabaseUrl: parsed.origin,
    serviceRoleKey,
    fingerprintKey,
    fingerprintKeyId,
    ipHashKey,
  };
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value === null || typeof value !== "object") return value;

  const object = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(object).sort()) out[key] = stableValue(object[key]);
  return out;
}

export function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

export function hmacSha256Hex(key: string, value: string): string {
  return createHmac("sha256", key).update(value, "utf8").digest("hex");
}

function requestFingerprint(payload: ServerRequestPayload, config: RequestApiConfig): string {
  return hmacSha256Hex(config.fingerprintKey, stableJson(payload));
}

export function cloudflareIp(request: Request): string | null {
  const candidate = request.headers.get("cf-connecting-ip")?.trim() ?? "";
  return isIP(candidate) > 0 ? candidate : null;
}

function ipHash(request: Request, config: RequestApiConfig): string | null {
  const ip = cloudflareIp(request);
  return ip === null ? null : hmacSha256Hex(config.ipHashKey, ip);
}

function responseHeaders(): Headers {
  return new Headers({
    "Cache-Control": "no-store, max-age=0",
    "Content-Type": "application/json; charset=utf-8",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });
}

export function jsonResponse(body: unknown, status: number, extraHeaders?: HeadersInit): Response {
  const headers = responseHeaders();
  if (extraHeaders !== undefined) {
    const additions = new Headers(extraHeaders);
    additions.forEach((value, key) => headers.set(key, value));
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function validationFieldErrors(error: z.ZodError): Record<string, true> {
  const fieldErrors: Record<string, true> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && SERVER_FIELD_NAMES.has(field)) fieldErrors[field] = true;
  }
  return fieldErrors;
}

async function readBoundedUtf8Body(request: Request): Promise<string | null> {
  if (request.body === null) return null;

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(next.value);
    }
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    return null;
  }
}

async function readPayload(
  request: Request,
): Promise<
  | { readonly ok: true; readonly payload: ServerRequestPayload }
  | { readonly ok: false; readonly response: Response }
> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    return {
      ok: false,
      response: jsonResponse({ code: "VALIDATION_ERROR", field_errors: {} }, 422),
    };
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const declared = Number(contentLength);
    if (!Number.isFinite(declared) || declared < 0 || declared > MAX_BODY_BYTES) {
      return {
        ok: false,
        response: jsonResponse({ code: "VALIDATION_ERROR", field_errors: {} }, 422),
      };
    }
  }

  const text = await readBoundedUtf8Body(request);
  if (text === null) {
    return {
      ok: false,
      response: jsonResponse({ code: "VALIDATION_ERROR", field_errors: {} }, 422),
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      response: jsonResponse({ code: "VALIDATION_ERROR", field_errors: {} }, 422),
    };
  }

  const result = requestPayloadSchema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      response: jsonResponse(
        { code: "VALIDATION_ERROR", field_errors: validationFieldErrors(result.error) },
        422,
      ),
    };
  }

  return { ok: true, payload: result.data };
}

function normalizeRpcResult(value: unknown): RequestRpcResult | null {
  const result = rpcResultSchema.safeParse(value);
  return result.success ? result.data : null;
}

function publicRpcResult(result: RequestRpcResult): Record<string, unknown> {
  switch (result.code) {
    case "REQUEST_CREATED":
    case "REQUEST_REPLAYED":
      return { code: result.code, tracking_code: result.tracking_code };
    case "PRICE_CHANGED":
      return { code: result.code, price: result.price };
    case "TERMS_UPDATED":
      return { code: result.code, terms: result.terms };
    case "VALIDATION_ERROR":
      return {
        code: result.code,
        field_errors: Object.fromEntries(
          Object.keys(result.field_errors)
            .filter((key) => SERVER_FIELD_NAMES.has(key))
            .map((key) => [key, true]),
        ),
      };
    default:
      return { code: result.code };
  }
}

function responseForRpcResult(result: RequestRpcResult): Response {
  const body = publicRpcResult(result);
  switch (result.code) {
    case "REQUEST_CREATED":
      return jsonResponse(body, 201);
    case "REQUEST_REPLAYED":
      return jsonResponse(body, 200);
    case "PRICE_CHANGED":
    case "SELECTION_UNAVAILABLE":
    case "TERMS_UPDATED":
    case "IDEMPOTENCY_CONFLICT":
    case "IDEMPOTENCY_EXPIRED":
      return jsonResponse(body, 409);
    case "VALIDATION_ERROR":
      return jsonResponse(body, 422);
    case "RATE_LIMITED":
      return jsonResponse(body, 429, { "Retry-After": String(RATE_LIMIT_RETRY_SECONDS) });
    case "TEMPORARILY_UNAVAILABLE":
    default:
      return jsonResponse({ code: "TEMPORARILY_UNAVAILABLE" }, 503);
  }
}

async function callRequestRpc(
  config: RequestApiConfig,
  input: RpcInput,
): Promise<RequestRpcResult | null> {
  let response: Response;
  try {
    response = await fetch(`${config.supabaseUrl}/rest/v1/rpc/create_request_atomic`, {
      method: "POST",
      headers: {
        apikey: config.serviceRoleKey,
        authorization: `Bearer ${config.serviceRoleKey}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    return null;
  }

  if (!response.ok) return null;

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return null;
  }
  return normalizeRpcResult(body);
}

export interface RequestApiDependencies {
  readonly getTerms: typeof getRequestTermsDocument;
  readonly getConfig: () => RequestApiConfig;
  readonly callRpc: (config: RequestApiConfig, input: RpcInput) => Promise<RequestRpcResult | null>;
}

const defaultDependencies: RequestApiDependencies = {
  getTerms: getRequestTermsDocument,
  getConfig: readConfig,
  callRpc: callRequestRpc,
};

export async function handleSubmitRequest(
  request: Request,
  dependencies: RequestApiDependencies = defaultDependencies,
  securityContext: RequestSecurityContext = DEFAULT_SECURITY_CONTEXT,
): Promise<Response> {
  const parsed = await readPayload(request);
  if (!parsed.ok) return parsed.response;

  let config: RequestApiConfig;
  try {
    config = dependencies.getConfig();
  } catch {
    return jsonResponse({ code: "TEMPORARILY_UNAVAILABLE" }, 503);
  }

  let terms: Awaited<ReturnType<typeof getRequestTermsDocument>>;
  try {
    terms = await dependencies.getTerms();
  } catch {
    terms = null;
  }

  const rpcInput: RpcInput = {
    p_payload: parsed.payload,
    p_request_fingerprint: requestFingerprint(parsed.payload, config),
    p_request_fingerprint_key_id: config.fingerprintKeyId,
    p_current_terms_version: terms?.version ?? null,
    p_current_terms_hash: terms?.contentHash ?? null,
    p_bot_verification: securityContext.botVerification,
    p_risk_flags: securityContext.riskFlags,
    p_ip_hash: ipHash(request, config),
  };

  const result = await dependencies.callRpc(config, rpcInput);
  return result === null
    ? jsonResponse({ code: "TEMPORARILY_UNAVAILABLE" }, 503)
    : responseForRpcResult(result);
}
