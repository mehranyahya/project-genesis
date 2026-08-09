import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { isIP } from "node:net";

const SUBMIT_PATH = "/api/submit-request";
const TOKEN_MAX_LENGTH = 2048;
const UPSTREAM_TIMEOUT_MS = 12_000;
const RESPONSE_BODY_LIMIT = 16 * 1024;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const TRACKING_PATTERN = /^MA-[1-9][0-9]{3,}$/;
const KEY_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PUBLIC_CODES = new Set([
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
]);

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

interface GatewayConfig {
  readonly functionUrl: string;
  readonly keys: Readonly<Record<string, string>>;
  readonly primaryKeyId: string;
  readonly ipHashSecret: string;
  readonly allowedOrigins: ReadonlySet<string>;
}

interface GatewayMetadata {
  readonly ip_hash: string | null;
  readonly origin: string;
  readonly received_at_unix: number;
  readonly nonce: string;
  readonly gateway_key_id: string;
  readonly worker_request_id: string;
}

interface SignedEnvelope {
  readonly payload: Readonly<Record<string, unknown>>;
  readonly gateway: GatewayMetadata;
}

export interface GatewayDependencies {
  readonly fetchUpstream: typeof fetch;
  readonly nowUnix: () => number;
  readonly randomNonce: () => string;
  readonly randomUuid: () => string;
}

const defaultDependencies: GatewayDependencies = {
  fetchUpstream: fetch,
  nowUnix: () => Math.floor(Date.now() / 1000),
  randomNonce: () => randomBytes(16).toString("hex"),
  randomUuid: randomUUID,
};

function envString(env: unknown, name: string): string | null {
  if (env === null || typeof env !== "object") return null;
  const value = (env as Record<string, unknown>)[name];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function normalizeOrigin(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== "https:" ||
      parsed.username !== "" ||
      parsed.password !== "" ||
      parsed.pathname !== "/" ||
      parsed.search !== "" ||
      parsed.hash !== ""
    ) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

function parseAllowedOrigins(raw: string): ReadonlySet<string> | null {
  const values = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (values.length === 0) return null;
  const normalized = values.map(normalizeOrigin);
  if (normalized.some((value) => value === null)) return null;
  const origins = new Set(normalized as string[]);
  return origins.size === values.length ? origins : null;
}

function parseGatewayKeys(raw: string): Readonly<Record<string, string>> | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length < 1 || entries.length > 2) return null;
  const keys: Record<string, string> = {};
  for (const [keyId, secret] of entries) {
    if (!KEY_ID_PATTERN.test(keyId) || typeof secret !== "string" || secret.length < 32) {
      return null;
    }
    keys[keyId] = secret;
  }
  return keys;
}

function readGatewayConfig(env: unknown): GatewayConfig | null {
  const rawBaseUrl = envString(env, "SUPABASE_FUNCTION_BASE_URL");
  const rawKeys = envString(env, "EDGE_GATEWAY_KEYS_JSON");
  const primaryKeyId = envString(env, "EDGE_GATEWAY_PRIMARY_KEY_ID");
  const ipHashSecret = envString(env, "IP_HASH_SECRET");
  const rawOrigins = envString(env, "ALLOWED_ORIGINS");
  if (
    rawBaseUrl === null ||
    rawKeys === null ||
    primaryKeyId === null ||
    ipHashSecret === null ||
    ipHashSecret.length < 32 ||
    rawOrigins === null
  ) {
    return null;
  }

  let baseUrl: URL;
  try {
    baseUrl = new URL(rawBaseUrl);
  } catch {
    return null;
  }
  if (
    baseUrl.protocol !== "https:" ||
    baseUrl.username !== "" ||
    baseUrl.password !== "" ||
    baseUrl.search !== "" ||
    baseUrl.hash !== ""
  ) {
    return null;
  }

  const keys = parseGatewayKeys(rawKeys);
  const allowedOrigins = parseAllowedOrigins(rawOrigins);
  if (keys === null || allowedOrigins === null || !KEY_ID_PATTERN.test(primaryKeyId)) {
    return null;
  }
  const primarySecret = keys[primaryKeyId];
  if (primarySecret === undefined) return null;

  const normalizedBase = rawBaseUrl.replace(/\/+$/, "");
  return {
    functionUrl: `${normalizedBase}/submit-request`,
    keys,
    primaryKeyId,
    ipHashSecret,
    allowedOrigins,
  };
}

function hasControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

function readTurnstileToken(request: Request): string | null | false {
  const value = request.headers.get("x-turnstile-token");
  if (value === null || value.length === 0) return null;
  if (value.length > TOKEN_MAX_LENGTH || hasControlCharacters(value)) return false;
  return value;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value === null || typeof value !== "object") return value;
  const object = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(object).sort()) result[key] = stableValue(object[key]);
  return result;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

export function canonicalizeClientIp(value: string): string | null {
  const candidate = value.trim();
  const family = isIP(candidate);
  if (family === 4) {
    return candidate
      .split(".")
      .map((part) => String(Number(part)))
      .join(".");
  }
  if (family !== 6) return null;
  try {
    const hostname = new URL(`http://[${candidate}]/`).hostname;
    if (!hostname.startsWith("[") || !hostname.endsWith("]")) return null;
    return hostname.slice(1, -1).toLowerCase();
  } catch {
    return null;
  }
}

function hashClientIp(request: Request, secret: string): string | null {
  const raw = request.headers.get("cf-connecting-ip");
  if (raw === null) return null;
  const canonical = canonicalizeClientIp(raw);
  return canonical === null ? null : createHmac("sha256", secret).update(canonical).digest("hex");
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function gatewaySignatureInput(input: {
  readonly canonicalEnvelopeBody: string;
  readonly timestamp: number;
  readonly nonce: string;
  readonly keyId: string;
}): string {
  return [
    "v1",
    "POST",
    SUBMIT_PATH,
    sha256Hex(input.canonicalEnvelopeBody),
    String(input.timestamp),
    input.nonce,
    input.keyId,
  ].join("\n");
}

function jsonResponse(body: unknown, status: number, extraHeaders?: HeadersInit): Response {
  const headers = new Headers({
    "cache-control": "no-store, max-age=0",
    "content-type": "application/json; charset=utf-8",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  });
  if (extraHeaders !== undefined) {
    new Headers(extraHeaders).forEach((value, key) => headers.set(key, value));
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function temporaryUnavailable(): Response {
  return jsonResponse({ code: "TEMPORARILY_UNAVAILABLE" }, 503);
}

function validationError(): Response {
  return jsonResponse({ code: "VALIDATION_ERROR", field_errors: {} }, 422);
}

function sanitizeFieldErrors(value: unknown): Record<string, true> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.keys(value as Record<string, unknown>)
      .filter((key) => FIELD_ERROR_ALLOWLIST.has(key))
      .map((key) => [key, true]),
  );
}

function sanitizePrice(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const price = value as Record<string, unknown>;
  if (price.price_type === "review" && price.amount_toman === null) {
    return { price_type: "review", amount_toman: null };
  }
  if (
    (price.price_type === "fixed" || price.price_type === "estimate") &&
    typeof price.amount_toman === "number" &&
    Number.isSafeInteger(price.amount_toman) &&
    price.amount_toman > 0
  ) {
    return { price_type: price.price_type, amount_toman: price.amount_toman };
  }
  return null;
}

function sanitizeTerms(value: unknown): Record<string, string> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const terms = value as Record<string, unknown>;
  if (
    typeof terms.version === "string" &&
    terms.version.trim().length >= 1 &&
    terms.version.trim().length <= 80 &&
    typeof terms.content_hash === "string" &&
    HASH_PATTERN.test(terms.content_hash)
  ) {
    return { version: terms.version.trim(), content_hash: terms.content_hash };
  }
  return null;
}

function sanitizeUpstream(body: unknown, status: number, retryAfter: string | null): Response {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return temporaryUnavailable();
  }
  const value = body as Record<string, unknown>;
  const code = value.code;
  if (typeof code !== "string") return temporaryUnavailable();
  if (code === "GATEWAY_REPLAY") return temporaryUnavailable();
  if (!PUBLIC_CODES.has(code)) return temporaryUnavailable();

  if (code === "REQUEST_CREATED" || code === "REQUEST_REPLAYED") {
    const expectedStatus = code === "REQUEST_CREATED" ? 201 : 200;
    return status === expectedStatus && typeof value.tracking_code === "string" &&
      TRACKING_PATTERN.test(value.tracking_code)
      ? jsonResponse({ code, tracking_code: value.tracking_code }, expectedStatus)
      : temporaryUnavailable();
  }
  if (code === "PRICE_CHANGED") {
    const price = sanitizePrice(value.price);
    return status === 409 && price !== null
      ? jsonResponse({ code, price }, 409)
      : temporaryUnavailable();
  }
  if (code === "TERMS_UPDATED") {
    const terms = sanitizeTerms(value.terms);
    return status === 409 && terms !== null
      ? jsonResponse({ code, terms }, 409)
      : temporaryUnavailable();
  }
  if (code === "VALIDATION_ERROR") {
    return status === 422
      ? jsonResponse({ code, field_errors: sanitizeFieldErrors(value.field_errors) }, 422)
      : temporaryUnavailable();
  }
  if (code === "BOT_VERIFICATION_INVALID") {
    return status === 422 ? jsonResponse({ code }, 422) : temporaryUnavailable();
  }
  if (code === "RATE_LIMITED") {
    if (status !== 429) return temporaryUnavailable();
    const safeRetry =
      retryAfter !== null && /^\d{1,5}$/.test(retryAfter) ? retryAfter : "600";
    return jsonResponse({ code }, 429, { "retry-after": safeRetry });
  }
  if (
    code === "SELECTION_UNAVAILABLE" ||
    code === "IDEMPOTENCY_CONFLICT" ||
    code === "IDEMPOTENCY_EXPIRED"
  ) {
    return status === 409 ? jsonResponse({ code }, 409) : temporaryUnavailable();
  }
  return temporaryUnavailable();
}

async function readUpstreamJson(response: Response): Promise<unknown | null> {
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > RESPONSE_BODY_LIMIT) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function handleSignedSubmitGateway(
  request: Request,
  env: unknown,
  dependencies: GatewayDependencies = defaultDependencies,
): Promise<Response | null> {
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return null;
  }
  if (url.pathname !== SUBMIT_PATH) return null;
  if (request.method !== "POST") {
    return jsonResponse({ code: "VALIDATION_ERROR", field_errors: {} }, 405);
  }

  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") return validationError();

  const config = readGatewayConfig(env);
  if (config === null) return temporaryUnavailable();

  const rawOrigin = request.headers.get("origin");
  const origin = rawOrigin === null ? null : normalizeOrigin(rawOrigin);
  if (origin === null || !config.allowedOrigins.has(origin)) {
    return jsonResponse({ code: "VALIDATION_ERROR", field_errors: {} }, 403);
  }

  const turnstileToken = readTurnstileToken(request);
  if (turnstileToken === false) {
    return jsonResponse({ code: "BOT_VERIFICATION_INVALID" }, 422);
  }

  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return validationError();
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return validationError();
  }
  const browserPayload = parsed as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(browserPayload, "turnstile_token")) {
    return validationError();
  }

  const timestamp = dependencies.nowUnix();
  const nonce = dependencies.randomNonce();
  const workerRequestId = dependencies.randomUuid();
  if (!/^[0-9a-f]{32}$/.test(nonce) || !UUID_PATTERN.test(workerRequestId)) {
    return temporaryUnavailable();
  }

  const gateway: GatewayMetadata = {
    ip_hash: hashClientIp(request, config.ipHashSecret),
    origin,
    received_at_unix: timestamp,
    nonce,
    gateway_key_id: config.primaryKeyId,
    worker_request_id: workerRequestId,
  };
  const payload = { ...browserPayload, turnstile_token: turnstileToken };
  const envelope: SignedEnvelope = { payload, gateway };
  const canonicalEnvelopeBody = canonicalJson(envelope);
  const signingInput = gatewaySignatureInput({
    canonicalEnvelopeBody,
    timestamp,
    nonce,
    keyId: config.primaryKeyId,
  });
  const secret = config.keys[config.primaryKeyId];
  if (secret === undefined) return temporaryUnavailable();
  const signature = createHmac("sha256", secret).update(signingInput, "utf8").digest("hex");

  let upstream: Response;
  try {
    upstream = await dependencies.fetchUpstream(config.functionUrl, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-gateway-key-id": config.primaryKeyId,
        "x-gateway-timestamp": String(timestamp),
        "x-gateway-nonce": nonce,
        "x-gateway-signature": signature,
      },
      body: canonicalEnvelopeBody,
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return temporaryUnavailable();
  }

  const body = await readUpstreamJson(upstream);
  return body === null
    ? temporaryUnavailable()
    : sanitizeUpstream(body, upstream.status, upstream.headers.get("retry-after"));
}
