import { canonicalJson, hmacSha256Hex } from "../_shared/crypto.ts";
import { verifyGatewayEnvelope } from "../_shared/gateway-auth.ts";
import { prepareBusinessRequest } from "../_shared/request-business.ts";
import { parseRequestPayload } from "../_shared/request-contract.ts";
import type { BotVerification, RiskFlag } from "../_shared/request-contract.ts";
import { readSupabaseServerConfig, supabaseRpc } from "../_shared/supabase-rest.ts";
import { processTelegramByRequestId } from "../_shared/telegram-delivery.ts";
import { verifyTurnstile } from "../_shared/turnstile.ts";
import { parseStrictJson } from "../_shared/json.ts";

const TRACKING_PREFIX_PATTERN = /^[A-Z][A-Z0-9]{1,9}$/;
const TRACKING_PATTERN = /^[A-Z][A-Z0-9]{1,9}-[1-9][0-9]{3,}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const KEY_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface FingerprintConfig {
  readonly keys: Readonly<Record<string, string>>;
  readonly primaryKeyId: string;
}

interface InspectResult {
  readonly code?: unknown;
  readonly tracking_code?: unknown;
}

interface StorageResult {
  readonly code?: unknown;
  readonly tracking_code?: unknown;
  readonly request_id?: unknown;
}

function responseHeaders(): Headers {
  return new Headers({
    "cache-control": "no-store, max-age=0",
    "content-type": "application/json; charset=utf-8",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  });
}

function jsonResponse(body: unknown, status: number, extraHeaders?: HeadersInit): Response {
  const headers = responseHeaders();
  if (extraHeaders !== undefined) {
    new Headers(extraHeaders).forEach((value, key) => headers.set(key, value));
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function temporaryUnavailable(): Response {
  return jsonResponse({ code: "TEMPORARILY_UNAVAILABLE" }, 503);
}

function readFingerprintConfig(): FingerprintConfig | null {
  const rawMap = Deno.env.get("REQUEST_FINGERPRINT_KEYS_JSON")?.trim() ?? "";
  const primaryKeyId = Deno.env.get("REQUEST_FINGERPRINT_PRIMARY_KEY_ID")?.trim() ?? "";
  if (rawMap === "" || !KEY_ID_PATTERN.test(primaryKeyId)) return null;

  const value = parseStrictJson(rawMap);
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length < 1 || entries.length > 2) return null;
  const keys: Record<string, string> = {};
  for (const [keyId, secret] of entries) {
    if (!KEY_ID_PATTERN.test(keyId) || typeof secret !== "string" || secret.length < 32) {
      return null;
    }
    Object.defineProperty(keys, keyId, {
      value: secret,
      enumerable: true,
      configurable: false,
      writable: false,
    });
  }
  if (keys[primaryKeyId] === undefined) return null;
  return { keys, primaryKeyId };
}

function trackingCodePrefix(): string | null {
  const value = Deno.env.get("TRACKING_CODE_PREFIX")?.trim() ?? "";
  return TRACKING_PREFIX_PATTERN.test(value) ? value : null;
}

function inspectResponse(value: InspectResult): Response | null | false {
  if (value.code === "MISSING") return null;
  if (value.code === "REQUEST_REPLAYED") {
    return typeof value.tracking_code === "string" && TRACKING_PATTERN.test(value.tracking_code)
      ? jsonResponse({ code: "REQUEST_REPLAYED", tracking_code: value.tracking_code }, 200)
      : false;
  }
  if (value.code === "IDEMPOTENCY_CONFLICT" || value.code === "IDEMPOTENCY_EXPIRED") {
    return jsonResponse({ code: value.code }, 409);
  }
  if (value.code === "TEMPORARILY_UNAVAILABLE") return temporaryUnavailable();
  return false;
}

function storageResponse(
  value: StorageResult,
): { readonly response: Response; readonly immediateRequestId: string | null } | false {
  if (value.code === "REQUEST_CREATED" || value.code === "REQUEST_REPLAYED") {
    const status = value.code === "REQUEST_CREATED" ? 201 : 200;
    if (typeof value.tracking_code !== "string" || !TRACKING_PATTERN.test(value.tracking_code)) {
      return false;
    }
    if (
      value.request_id !== undefined &&
      (typeof value.request_id !== "string" || !UUID_PATTERN.test(value.request_id))
    ) {
      return false;
    }
    if (value.code === "REQUEST_CREATED" && typeof value.request_id !== "string") return false;
    return {
      response: jsonResponse({ code: value.code, tracking_code: value.tracking_code }, status),
      immediateRequestId: value.code === "REQUEST_CREATED" ? (value.request_id as string) : null,
    };
  }
  if (value.code === "RATE_LIMITED") {
    return {
      response: jsonResponse({ code: "RATE_LIMITED" }, 429, { "retry-after": "600" }),
      immediateRequestId: null,
    };
  }
  if (value.code === "IDEMPOTENCY_CONFLICT" || value.code === "IDEMPOTENCY_EXPIRED") {
    return { response: jsonResponse({ code: value.code }, 409), immediateRequestId: null };
  }
  if (value.code === "TEMPORARILY_UNAVAILABLE") {
    return { response: temporaryUnavailable(), immediateRequestId: null };
  }
  return false;
}

function scheduleImmediateTelegramDelivery(
  supabase: ReturnType<typeof readSupabaseServerConfig>,
  requestId: string | null,
): void {
  if (requestId === null) return;
  const task = processTelegramByRequestId(supabase, requestId).catch(() => {
    console.error("Telegram immediate delivery failed");
  });
  const runtime = (
    globalThis as unknown as {
      readonly EdgeRuntime?: { readonly waitUntil?: (promise: Promise<unknown>) => void };
    }
  ).EdgeRuntime;
  if (typeof runtime?.waitUntil === "function") runtime.waitUntil(task);
}

function logOutcome(input: {
  readonly workerRequestId: string | null;
  readonly code: string;
  readonly status: number;
  readonly durationMs: number;
  readonly botVerification?: BotVerification;
}): void {
  console.log(
    JSON.stringify({
      worker_request_id: input.workerRequestId,
      code: input.code,
      status: input.status,
      duration_ms: input.durationMs,
      ...(input.botVerification === undefined ? {} : { bot_verification: input.botVerification }),
    }),
  );
}

Deno.serve(async (request: Request) => {
  const startedAt = performance.now();
  let workerRequestId: string | null = null;
  let botVerification: BotVerification | undefined;

  const finish = (response: Response, code: string): Response => {
    logOutcome({
      workerRequestId,
      code,
      status: response.status,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      ...(botVerification === undefined ? {} : { botVerification }),
    });
    return response;
  };

  try {
    const supabase = readSupabaseServerConfig();
    const gatewayAuth = await verifyGatewayEnvelope(request, supabase);
    if (gatewayAuth.kind === "configuration_error") {
      return finish(temporaryUnavailable(), "TEMPORARILY_UNAVAILABLE");
    }
    if (gatewayAuth.kind === "replay") {
      // Internal only. Worker maps this to public TEMPORARILY_UNAVAILABLE.
      return finish(jsonResponse({ code: "GATEWAY_REPLAY" }, 409), "GATEWAY_REPLAY");
    }
    if (gatewayAuth.kind !== "ok") {
      return finish(jsonResponse({ code: "TEMPORARILY_UNAVAILABLE" }, 401), "GATEWAY_AUTH_INVALID");
    }
    workerRequestId = gatewayAuth.envelope.gateway.worker_request_id;

    const parsed = parseRequestPayload(gatewayAuth.envelope.payload);
    if (!parsed.ok) {
      return finish(
        jsonResponse({ code: "VALIDATION_ERROR", field_errors: parsed.fieldErrors }, 422),
        "VALIDATION_ERROR",
      );
    }
    if (parsed.value.honeypotFilled) {
      return finish(
        jsonResponse({ code: "VALIDATION_ERROR", field_errors: {} }, 422),
        "VALIDATION_ERROR",
      );
    }

    const fingerprintConfig = readFingerprintConfig();
    const prefix = trackingCodePrefix();
    if (fingerprintConfig === null || prefix === null) {
      return finish(temporaryUnavailable(), "TEMPORARILY_UNAVAILABLE");
    }
    const fingerprintSecret = fingerprintConfig.keys[fingerprintConfig.primaryKeyId];
    if (fingerprintSecret === undefined) {
      return finish(temporaryUnavailable(), "TEMPORARILY_UNAVAILABLE");
    }
    const canonicalRequest = canonicalJson(parsed.value.request);
    const candidates = await Promise.all(
      [
        fingerprintConfig.primaryKeyId,
        ...Object.keys(fingerprintConfig.keys).filter(
          (keyId) => keyId !== fingerprintConfig.primaryKeyId,
        ),
      ].map(async (keyId) => ({
        keyId,
        fingerprint: await hmacSha256Hex(fingerprintConfig.keys[keyId]!, canonicalRequest),
      })),
    );
    const primaryCandidate = candidates[0];
    if (primaryCandidate === undefined) {
      return finish(temporaryUnavailable(), "TEMPORARILY_UNAVAILABLE");
    }
    const fingerprint = primaryCandidate.fingerprint;
    if (!HASH_PATTERN.test(fingerprint)) {
      return finish(temporaryUnavailable(), "TEMPORARILY_UNAVAILABLE");
    }

    // Replay lookup intentionally happens before Siteverify. A valid replay must
    // not fail because its one-time Turnstile token was already consumed.
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index]!;
      const inspected = await supabaseRpc<InspectResult>(supabase, "inspect_request_idempotency", {
        p_submission_id: parsed.value.request.submission_id,
        p_request_fingerprint: candidate.fingerprint,
        p_request_fingerprint_key_id: candidate.keyId,
      });
      if (inspected.code === "MISSING") break;
      if (inspected.code === "IDEMPOTENCY_CONFLICT" && index + 1 < candidates.length) continue;
      const replayResponse = inspectResponse(inspected);
      if (replayResponse === false || replayResponse === null) {
        return finish(temporaryUnavailable(), "TEMPORARILY_UNAVAILABLE");
      }
      return finish(replayResponse, String(inspected.code));
    }

    const turnstile = await verifyTurnstile({
      token: parsed.value.turnstileToken,
      submissionId: parsed.value.request.submission_id,
      fastSubmitSignal:
        parsed.value.formFillDurationMs !== null && parsed.value.formFillDurationMs < 2_000,
    });
    if (turnstile.kind === "configuration_error") {
      return finish(temporaryUnavailable(), "TEMPORARILY_UNAVAILABLE");
    }
    if (turnstile.kind === "invalid") {
      return finish(
        jsonResponse({ code: "BOT_VERIFICATION_INVALID" }, 422),
        "BOT_VERIFICATION_INVALID",
      );
    }
    botVerification = turnstile.botVerification;
    const riskFlags: readonly RiskFlag[] = turnstile.riskFlags;

    const business = await prepareBusinessRequest({
      config: supabase,
      request: parsed.value.request,
      fingerprint,
      fingerprintKeyId: fingerprintConfig.primaryKeyId,
      botVerification,
      riskFlags,
      ipHash: gatewayAuth.envelope.gateway.ip_hash,
      trackingCodePrefix: prefix,
      nowIso: new Date().toISOString(),
    });
    if (!business.ok) {
      return finish(jsonResponse(business.body, business.status), business.body.code);
    }

    const stored = await supabaseRpc<StorageResult>(
      supabase,
      "create_request_atomic_storage",
      business.storage,
    );
    const storedResponse = storageResponse(stored);
    if (storedResponse === false) {
      return finish(temporaryUnavailable(), "TEMPORARILY_UNAVAILABLE");
    }
    scheduleImmediateTelegramDelivery(supabase, storedResponse.immediateRequestId);
    return finish(storedResponse.response, String(stored.code));
  } catch {
    return finish(temporaryUnavailable(), "TEMPORARILY_UNAVAILABLE");
  }
});
