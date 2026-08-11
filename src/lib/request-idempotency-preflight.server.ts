import { z } from "zod";

import type { RequestApiConfig } from "./request-api.server";
import {
  jsonResponse,
  readRequestApiConfig,
  requestFingerprint,
  requestPayloadSchema,
} from "./request-api.server";

const MAX_BODY_BYTES = 16 * 1024;
const RPC_TIMEOUT_MS = 5_000;
const TRACKING_PATTERN = /^[A-Z][A-Z0-9]{1,9}-[1-9][0-9]{3,}$/;

const inspectResultSchema = z.union([
  z.object({ code: z.literal("MISSING") }).strict(),
  z
    .object({
      code: z.literal("REQUEST_REPLAYED"),
      tracking_code: z.string().regex(TRACKING_PATTERN),
    })
    .strict(),
  z
    .object({
      code: z.enum(["IDEMPOTENCY_CONFLICT", "IDEMPOTENCY_EXPIRED", "TEMPORARILY_UNAVAILABLE"]),
    })
    .strict(),
]);

type InspectResult = z.infer<typeof inspectResultSchema>;

export interface InspectRequestIdempotencyInput {
  readonly p_submission_id: string;
  readonly p_request_fingerprint: string;
  readonly p_request_fingerprint_key_id: string;
}

export interface RequestIdempotencyPreflightDependencies {
  readonly getConfig: () => RequestApiConfig;
  readonly callInspectRpc: (
    config: RequestApiConfig,
    input: InspectRequestIdempotencyInput,
  ) => Promise<InspectResult | null>;
}

export type RequestIdempotencyPreflight =
  | { readonly kind: "missing" }
  | { readonly kind: "skip" }
  | { readonly kind: "resolved"; readonly response: Response };

async function readBoundedClone(request: Request): Promise<string | null> {
  let clone: Request;
  try {
    clone = request.clone();
  } catch {
    return null;
  }
  if (clone.body === null) return null;

  const reader = clone.body.getReader();
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

async function callInspectRequestRpc(
  config: RequestApiConfig,
  input: InspectRequestIdempotencyInput,
): Promise<InspectResult | null> {
  let response: Response;
  try {
    response = await fetch(`${config.supabaseUrl}/rest/v1/rpc/inspect_request_idempotency`, {
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

  let value: unknown;
  try {
    value = await response.json();
  } catch {
    return null;
  }

  const parsed = inspectResultSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

const defaultDependencies: RequestIdempotencyPreflightDependencies = {
  getConfig: readRequestApiConfig,
  callInspectRpc: callInspectRequestRpc,
};

export async function inspectRequestIdempotencyBeforeTurnstile(
  request: Request,
  dependencies: RequestIdempotencyPreflightDependencies = defaultDependencies,
): Promise<RequestIdempotencyPreflight> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") return { kind: "skip" };

  const text = await readBoundedClone(request);
  if (text === null) return { kind: "skip" };

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { kind: "skip" };
  }

  const parsed = requestPayloadSchema.safeParse(value);
  if (!parsed.success) return { kind: "skip" };

  let config: RequestApiConfig;
  try {
    config = dependencies.getConfig();
  } catch {
    return {
      kind: "resolved",
      response: jsonResponse({ code: "TEMPORARILY_UNAVAILABLE" }, 503),
    };
  }

  const result = await dependencies.callInspectRpc(config, {
    p_submission_id: parsed.data.submission_id,
    p_request_fingerprint: requestFingerprint(parsed.data, config),
    p_request_fingerprint_key_id: config.fingerprintKeyId,
  });

  if (result === null || result.code === "TEMPORARILY_UNAVAILABLE") {
    return {
      kind: "resolved",
      response: jsonResponse({ code: "TEMPORARILY_UNAVAILABLE" }, 503),
    };
  }

  if (result.code === "MISSING") return { kind: "missing" };
  if (result.code === "REQUEST_REPLAYED") {
    return {
      kind: "resolved",
      response: jsonResponse(
        { code: "REQUEST_REPLAYED", tracking_code: result.tracking_code },
        200,
      ),
    };
  }

  return {
    kind: "resolved",
    response: jsonResponse({ code: result.code }, 409),
  };
}
