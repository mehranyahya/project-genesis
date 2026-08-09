import { canonicalJson, constantTimeHexEqual, hmacSha256Hex, sha256Hex } from "./crypto.ts";
import { supabaseRpc } from "./supabase-rest.ts";
import type { SupabaseServerConfig } from "./supabase-rest.ts";

const MAX_ENVELOPE_BYTES = 24 * 1024;
const GATEWAY_PATH = "/api/submit-request";
const KEY_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const NONCE_PATTERN = /^[0-9a-f]{32}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface GatewayMetadata {
  readonly ip_hash: string | null;
  readonly origin: string;
  readonly received_at_unix: number;
  readonly nonce: string;
  readonly gateway_key_id: string;
  readonly worker_request_id: string;
}

export interface VerifiedGatewayEnvelope {
  readonly payload: Readonly<Record<string, unknown>>;
  readonly gateway: GatewayMetadata;
}

export type GatewayAuthResult =
  | { readonly kind: "ok"; readonly envelope: VerifiedGatewayEnvelope }
  | { readonly kind: "replay" }
  | { readonly kind: "invalid" }
  | { readonly kind: "configuration_error" };

function readKeyMap(): Readonly<Record<string, string>> | null {
  const raw = Deno.env.get("EDGE_GATEWAY_KEYS_JSON")?.trim() ?? "";
  if (raw === "") return null;
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

function cleanOrigin(value: unknown): string | null {
  if (typeof value !== "string") return null;
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

function parseGateway(value: unknown): GatewayMetadata | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const allowed = [
    "ip_hash",
    "origin",
    "received_at_unix",
    "nonce",
    "gateway_key_id",
    "worker_request_id",
  ];
  if (
    Object.keys(raw).length !== allowed.length ||
    !Object.keys(raw).every((key) => allowed.includes(key))
  ) {
    return null;
  }

  const origin = cleanOrigin(raw.origin);
  if (
    origin === null ||
    (raw.ip_hash !== null &&
      (typeof raw.ip_hash !== "string" || !HASH_PATTERN.test(raw.ip_hash))) ||
    typeof raw.received_at_unix !== "number" ||
    !Number.isSafeInteger(raw.received_at_unix) ||
    typeof raw.nonce !== "string" ||
    !NONCE_PATTERN.test(raw.nonce) ||
    typeof raw.gateway_key_id !== "string" ||
    !KEY_ID_PATTERN.test(raw.gateway_key_id) ||
    typeof raw.worker_request_id !== "string" ||
    !UUID_PATTERN.test(raw.worker_request_id)
  ) {
    return null;
  }

  return {
    ip_hash: raw.ip_hash as string | null,
    origin,
    received_at_unix: raw.received_at_unix,
    nonce: raw.nonce,
    gateway_key_id: raw.gateway_key_id,
    worker_request_id: raw.worker_request_id,
  };
}

function signingInput(input: {
  readonly canonicalBody: string;
  readonly timestamp: number;
  readonly nonce: string;
  readonly keyId: string;
  readonly bodyHash: string;
}): string {
  return [
    "v1",
    "POST",
    GATEWAY_PATH,
    input.bodyHash,
    String(input.timestamp),
    input.nonce,
    input.keyId,
  ].join("\n");
}

async function readBoundedBody(request: Request): Promise<string | null> {
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_ENVELOPE_BYTES) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export async function verifyGatewayEnvelope(
  request: Request,
  supabase: SupabaseServerConfig,
): Promise<GatewayAuthResult> {
  if (request.method !== "POST") return { kind: "invalid" };
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") return { kind: "invalid" };

  const keyMap = readKeyMap();
  if (keyMap === null) return { kind: "configuration_error" };

  const rawBody = await readBoundedBody(request);
  if (rawBody === null) return { kind: "invalid" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { kind: "invalid" };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { kind: "invalid" };
  }
  const object = parsed as Record<string, unknown>;
  if (
    Object.keys(object).length !== 2 ||
    !Object.prototype.hasOwnProperty.call(object, "payload") ||
    !Object.prototype.hasOwnProperty.call(object, "gateway") ||
    object.payload === null ||
    typeof object.payload !== "object" ||
    Array.isArray(object.payload)
  ) {
    return { kind: "invalid" };
  }
  const gateway = parseGateway(object.gateway);
  if (gateway === null) return { kind: "invalid" };

  const headerKeyId = request.headers.get("x-gateway-key-id");
  const headerTimestamp = request.headers.get("x-gateway-timestamp");
  const headerNonce = request.headers.get("x-gateway-nonce");
  const headerSignature = request.headers.get("x-gateway-signature");
  if (
    headerKeyId !== gateway.gateway_key_id ||
    headerTimestamp !== String(gateway.received_at_unix) ||
    headerNonce !== gateway.nonce ||
    headerSignature === null ||
    !HASH_PATTERN.test(headerSignature)
  ) {
    return { kind: "invalid" };
  }

  const secret = keyMap[gateway.gateway_key_id];
  if (secret === undefined) return { kind: "invalid" };

  const nowUnix = Math.floor(Date.now() / 1000);
  if (gateway.received_at_unix < nowUnix - 60 || gateway.received_at_unix > nowUnix + 30) {
    return { kind: "invalid" };
  }

  const canonicalBody = canonicalJson(object);
  if (rawBody !== canonicalBody) return { kind: "invalid" };
  const bodyHash = await sha256Hex(canonicalBody);
  const expectedSignature = await hmacSha256Hex(
    secret,
    signingInput({
      canonicalBody,
      timestamp: gateway.received_at_unix,
      nonce: gateway.nonce,
      keyId: gateway.gateway_key_id,
      bodyHash,
    }),
  );
  if (!constantTimeHexEqual(expectedSignature, headerSignature)) {
    return { kind: "invalid" };
  }

  const claimed = await supabaseRpc<boolean>(supabase, "claim_gateway_nonce", {
    p_nonce: gateway.nonce,
    p_gateway_key_id: gateway.gateway_key_id,
    p_received_at_unix: gateway.received_at_unix,
  });
  if (claimed !== true) return { kind: "replay" };

  return {
    kind: "ok",
    envelope: {
      payload: object.payload as Record<string, unknown>,
      gateway,
    },
  };
}
