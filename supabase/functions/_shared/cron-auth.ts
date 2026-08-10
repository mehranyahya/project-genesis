import { constantTimeHexEqual, hmacSha256Hex, sha256Hex } from "./crypto.ts";
import { readGatewayKeyMap } from "./gateway-auth.ts";
import { canonicalJson, parseStrictJson, readBoundedUtf8 } from "./json.ts";
import { supabaseRpc } from "./supabase-rest.ts";
import type { SupabaseServerConfig } from "./supabase-rest.ts";

const RECOVERY_PATH = "/internal/telegram-recovery";
const MAX_BODY_BYTES = 1_024;
const KEY_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const NONCE_PATTERN = /^[0-9a-f]{32}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;

export type CronAuthResult =
  | { readonly kind: "ok" }
  | { readonly kind: "replay" }
  | { readonly kind: "invalid" }
  | { readonly kind: "configuration_error" };

function signatureInput(input: {
  readonly bodyHash: string;
  readonly timestamp: number;
  readonly nonce: string;
  readonly keyId: string;
}): string {
  return [
    "v1",
    "POST",
    RECOVERY_PATH,
    input.bodyHash,
    String(input.timestamp),
    input.nonce,
    input.keyId,
  ].join("\n");
}

export async function verifyRecoveryCronRequest(
  request: Request,
  supabase: SupabaseServerConfig,
): Promise<CronAuthResult> {
  if (request.method !== "POST") return { kind: "invalid" };
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") return { kind: "invalid" };

  const keyMap = readGatewayKeyMap();
  if (keyMap === null) return { kind: "configuration_error" };

  const rawBody = await readBoundedUtf8(request.body, MAX_BODY_BYTES);
  if (rawBody === null) return { kind: "invalid" };
  const body = parseStrictJson(rawBody);
  if (
    body === null ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).length !== 1 ||
    (body as Record<string, unknown>)["trigger"] !== "hourly" ||
    rawBody !== canonicalJson(body)
  ) {
    return { kind: "invalid" };
  }

  const keyId = request.headers.get("x-cron-key-id");
  const rawTimestamp = request.headers.get("x-cron-timestamp");
  const nonce = request.headers.get("x-cron-nonce");
  const signature = request.headers.get("x-cron-signature");
  if (
    keyId === null ||
    !KEY_ID_PATTERN.test(keyId) ||
    rawTimestamp === null ||
    !/^[0-9]{10}$/.test(rawTimestamp) ||
    nonce === null ||
    !NONCE_PATTERN.test(nonce) ||
    signature === null ||
    !HASH_PATTERN.test(signature)
  ) {
    return { kind: "invalid" };
  }
  const timestamp = Number(rawTimestamp);
  if (!Number.isSafeInteger(timestamp)) return { kind: "invalid" };
  const nowUnix = Math.floor(Date.now() / 1_000);
  if (timestamp < nowUnix - 60 || timestamp > nowUnix + 30) return { kind: "invalid" };

  const secret = keyMap[keyId];
  if (secret === undefined) return { kind: "invalid" };
  const expected = await hmacSha256Hex(
    secret,
    signatureInput({ bodyHash: await sha256Hex(rawBody), timestamp, nonce, keyId }),
  );
  if (!constantTimeHexEqual(expected, signature)) return { kind: "invalid" };

  const claimed = await supabaseRpc<boolean>(supabase, "claim_gateway_nonce", {
    p_nonce: nonce,
    p_gateway_key_id: keyId,
    p_received_at_unix: timestamp,
  });
  return claimed === true ? { kind: "ok" } : { kind: "replay" };
}
