import { createHash, createHmac, randomBytes } from "node:crypto";

import { canonicalJson, parseStrictJson, readBoundedUtf8 } from "./strict-json";

const RECOVERY_PATH = "/internal/telegram-recovery";
const RESPONSE_BODY_LIMIT = 16 * 1024;
const RECOVERY_TIMEOUT_MS = 105_000;
const KEY_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

interface RecoveryGatewayConfig {
  readonly functionUrl: string;
  readonly keyId: string;
  readonly secret: string;
}

interface RecoveryGatewayDependencies {
  readonly fetchUpstream: typeof fetch;
  readonly nowUnix: () => number;
  readonly randomNonce: () => string;
}

const defaultDependencies: RecoveryGatewayDependencies = {
  fetchUpstream: fetch,
  nowUnix: () => Math.floor(Date.now() / 1_000),
  randomNonce: () => randomBytes(16).toString("hex"),
};

function envString(env: unknown, name: string): string | null {
  if (env === null || typeof env !== "object") return null;
  const value = (env as Record<string, unknown>)[name];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function readConfig(env: unknown): RecoveryGatewayConfig | null {
  const rawBaseUrl = envString(env, "SUPABASE_FUNCTION_BASE_URL");
  const rawKeys = envString(env, "EDGE_GATEWAY_KEYS_JSON");
  const keyId = envString(env, "EDGE_GATEWAY_PRIMARY_KEY_ID");
  if (rawBaseUrl === null || rawKeys === null || keyId === null || !KEY_ID_PATTERN.test(keyId)) {
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

  const parsedKeys = parseStrictJson(rawKeys);
  if (parsedKeys === null || typeof parsedKeys !== "object" || Array.isArray(parsedKeys))
    return null;
  const entries = Object.entries(parsedKeys as Record<string, unknown>);
  if (entries.length < 1 || entries.length > 2) return null;
  for (const [candidateId, candidateSecret] of entries) {
    if (
      !KEY_ID_PATTERN.test(candidateId) ||
      typeof candidateSecret !== "string" ||
      candidateSecret.length < 32
    ) {
      return null;
    }
  }
  const secret = (parsedKeys as Record<string, unknown>)[keyId];
  if (typeof secret !== "string") return null;

  return {
    functionUrl: `${rawBaseUrl.replace(/\/+$/, "")}/telegram-recovery`,
    keyId,
    secret,
  };
}

export function recoverySignatureInput(input: {
  readonly canonicalBody: string;
  readonly timestamp: number;
  readonly nonce: string;
  readonly keyId: string;
}): string {
  const bodyHash = createHash("sha256").update(input.canonicalBody, "utf8").digest("hex");
  return [
    "v1",
    "POST",
    RECOVERY_PATH,
    bodyHash,
    String(input.timestamp),
    input.nonce,
    input.keyId,
  ].join("\n");
}

export async function runSignedTelegramRecovery(
  env: unknown,
  dependencies: RecoveryGatewayDependencies = defaultDependencies,
): Promise<void> {
  const config = readConfig(env);
  if (config === null) throw new Error("Telegram recovery gateway configuration is incomplete");

  const timestamp = dependencies.nowUnix();
  const nonce = dependencies.randomNonce();
  if (!Number.isSafeInteger(timestamp) || !/^[0-9a-f]{32}$/.test(nonce)) {
    throw new Error("Telegram recovery gateway entropy is invalid");
  }

  const canonicalBody = canonicalJson({ trigger: "hourly" });
  const signature = createHmac("sha256", config.secret)
    .update(
      recoverySignatureInput({
        canonicalBody,
        timestamp,
        nonce,
        keyId: config.keyId,
      }),
      "utf8",
    )
    .digest("hex");

  const response = await dependencies.fetchUpstream(config.functionUrl, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-cron-key-id": config.keyId,
      "x-cron-timestamp": String(timestamp),
      "x-cron-nonce": nonce,
      "x-cron-signature": signature,
    },
    body: canonicalBody,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS),
  });

  const raw = await readBoundedUtf8(response.body, RESPONSE_BODY_LIMIT);
  const parsed = raw === null ? null : parseStrictJson(raw);
  if (
    !response.ok ||
    parsed === null ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    (parsed as Record<string, unknown>)["code"] !== "RECOVERY_COMPLETED"
  ) {
    throw new Error(`Telegram recovery Edge Function failed (${response.status})`);
  }
}
