import { randomUUID } from "node:crypto";

import { z } from "zod";

import { cloudflareIp } from "./request-api.server";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TURNSTILE_ACTION = "submit_request";
const TOKEN_MAX_LENGTH = 2048;
const SITEVERIFY_TIMEOUT_MS = 8_000;
const MAX_ATTEMPTS = 2;

const siteverifySchema = z
  .object({
    success: z.boolean(),
    hostname: z.string().optional(),
    action: z.string().optional(),
    "error-codes": z.array(z.string()).optional(),
  })
  .passthrough();

export interface TurnstileConfig {
  readonly secretKey: string;
  readonly allowedHostnames: ReadonlySet<string>;
}

export type TurnstileVerification =
  { readonly kind: "verified" } | { readonly kind: "invalid" } | { readonly kind: "service_error" };

export interface TurnstileDependencies {
  readonly getConfig: () => TurnstileConfig;
  readonly fetchSiteverify: typeof fetch;
  readonly randomUuid: () => string;
}

function normalizeHostname(value: string): string | null {
  const hostname = value.trim().toLowerCase();
  if (hostname.length === 0 || hostname.length > 253) return null;
  if (hostname.includes(":") || hostname.includes("/") || hostname.includes(" ")) return null;
  if (!/^[a-z0-9.-]+$/.test(hostname)) return null;
  if (hostname.startsWith(".") || hostname.endsWith(".") || hostname.includes("..")) return null;
  return hostname;
}

function hasControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

function readConfig(): TurnstileConfig {
  const env = process.env as Record<string, string | undefined>;
  const secretKey = env["TURNSTILE_SECRET_KEY"]?.trim();
  const rawHostnames = env["TURNSTILE_ALLOWED_HOSTNAMES"]?.trim();

  if (!secretKey || !rawHostnames) throw new Error("Turnstile configuration is incomplete");

  const hostnames = rawHostnames
    .split(",")
    .map(normalizeHostname)
    .filter((value): value is string => value !== null);
  if (hostnames.length === 0 || hostnames.length !== rawHostnames.split(",").length) {
    throw new Error("Turnstile hostname allowlist is invalid");
  }

  return { secretKey, allowedHostnames: new Set(hostnames) };
}

const defaultDependencies: TurnstileDependencies = {
  getConfig: readConfig,
  fetchSiteverify: fetch,
  randomUuid: randomUUID,
};

export function readTurnstileToken(request: Request): string | null {
  const token = request.headers.get("x-turnstile-token") ?? "";
  if (token.length === 0 || token.length > TOKEN_MAX_LENGTH) return null;
  if (hasControlCharacters(token)) return null;
  return token;
}

async function validateOnce(
  request: Request,
  token: string,
  idempotencyKey: string,
  config: TurnstileConfig,
  fetchSiteverify: typeof fetch,
): Promise<TurnstileVerification> {
  const ip = cloudflareIp(request);
  const payload: Record<string, string> = {
    secret: config.secretKey,
    response: token,
    idempotency_key: idempotencyKey,
  };
  if (ip !== null) payload["remoteip"] = ip;

  let response: Response;
  try {
    response = await fetchSiteverify(SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    return { kind: "service_error" };
  }

  if (!response.ok) return { kind: "service_error" };

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { kind: "service_error" };
  }

  const parsed = siteverifySchema.safeParse(body);
  if (!parsed.success) return { kind: "service_error" };

  const result = parsed.data;
  if (!result.success) {
    return result["error-codes"]?.includes("internal-error")
      ? { kind: "service_error" }
      : { kind: "invalid" };
  }

  const hostname = result.hostname === undefined ? null : normalizeHostname(result.hostname);
  if (
    hostname === null ||
    !config.allowedHostnames.has(hostname) ||
    result.action !== TURNSTILE_ACTION
  ) {
    return { kind: "invalid" };
  }

  return { kind: "verified" };
}

export async function verifyTurnstileRequest(
  request: Request,
  dependencies: TurnstileDependencies = defaultDependencies,
): Promise<TurnstileVerification> {
  const token = readTurnstileToken(request);
  if (token === null) return { kind: "invalid" };

  let config: TurnstileConfig;
  try {
    config = dependencies.getConfig();
  } catch {
    return { kind: "service_error" };
  }

  const idempotencyKey = dependencies.randomUuid();
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const result = await validateOnce(
      request,
      token,
      idempotencyKey,
      config,
      dependencies.fetchSiteverify,
    );
    if (result.kind !== "service_error" || attempt === MAX_ATTEMPTS - 1) return result;
  }

  return { kind: "service_error" };
}
