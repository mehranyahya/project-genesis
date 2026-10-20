// Server-only boundary. Vendor credentials and wire formats stay inside a
// reviewed adapter, never in the Worker, browser, outbox or delivery summary.
import { parseStrictJson, readBoundedUtf8 } from "./json.ts";

export type SmsOutcome =
  | { readonly kind: "accepted"; readonly receipt: string }
  | { readonly kind: "retryable"; readonly retryAfterSeconds: number | null }
  | { readonly kind: "permanent_failure" }
  | { readonly kind: "uncertain" };

export interface SmsMessage {
  readonly event: "request_received";
  readonly to: string;
  readonly locale: "fa" | "en";
  readonly templateId: string;
  readonly parameters: { readonly tracking_code: string };
  // Stable across attempts; forwarding it only provides deduplication if the
  // selected provider explicitly documents and implements that guarantee.
  readonly idempotencyKey: string;
}

export interface SmsProvider {
  readonly id: string;
  // Adapter must honor the deadline. Only a documented, explicit NOT ACCEPTED
  // response may become retryable. HTTP 5xx/timeout alone is not such evidence.
  send(message: SmsMessage, signal: AbortSignal): Promise<SmsOutcome>;
}

// Deliberately no mock/dry-run/live provider selectable through environment.
// Add a statically imported, reviewed adapter here after the panel is chosen.
// A key alone must never turn on an unreviewed generic HTTP sender.
export function resolveSmsProvider(_id: string): SmsProvider | null {
  return null;
}

export function parseSmsOutcome(value: unknown): SmsOutcome {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { kind: "uncertain" };
  }
  const item = value as Record<string, unknown>;
  const keys = Object.keys(item);
  if (item.kind === "accepted" && keys.length === 2 && keys.includes("receipt")) {
    return typeof item.receipt === "string" && /^[A-Za-z0-9._:-]{1,128}$/.test(item.receipt)
      ? { kind: "accepted", receipt: item.receipt }
      : { kind: "uncertain" };
  }
  if (item.kind === "retryable" && keys.length === 2 && keys.includes("retryAfterSeconds")) {
    const seconds = item.retryAfterSeconds;
    return seconds === null ||
      (typeof seconds === "number" &&
        Number.isInteger(seconds) &&
        seconds >= 1 &&
        seconds <= 86_400)
      ? { kind: "retryable", retryAfterSeconds: seconds }
      : { kind: "uncertain" };
  }
  if (keys.length === 1 && (item.kind === "permanent_failure" || item.kind === "uncertain")) {
    return { kind: item.kind };
  }
  return { kind: "uncertain" };
}

// Reusable transport for a future JSON panel adapter. Endpoint and origin must
// be constants in that adapter, not environment values or request parameters.
// This helper does not interpret provider acceptance or retry HTTP failures.
export async function postSmsJson(
  input: {
    readonly endpoint: string;
    readonly allowedOrigin: string;
    readonly headers: Readonly<Record<string, string>>;
    readonly body: Readonly<Record<string, unknown>>;
    readonly signal: AbortSignal;
  },
  fetchProvider: typeof fetch = fetch,
): Promise<{ readonly status: number; readonly body: unknown }> {
  const endpoint = new URL(input.endpoint);
  const origin = new URL(input.allowedOrigin);
  if (
    endpoint.protocol !== "https:" ||
    endpoint.origin !== origin.origin ||
    origin.href !== `${origin.origin}/` ||
    endpoint.username !== "" ||
    endpoint.password !== "" ||
    endpoint.search !== "" ||
    endpoint.hash !== "" ||
    origin.username !== "" ||
    origin.password !== ""
  ) {
    throw new Error("SMS endpoint configuration invalid");
  }
  const response = await fetchProvider(endpoint.href, {
    method: "POST",
    headers: { ...input.headers, accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(input.body),
    signal: AbortSignal.any([input.signal, AbortSignal.timeout(8_000)]),
    redirect: "error",
    cache: "no-store",
  });
  const declared = response.headers.get("content-length");
  if (declared !== null && Number(declared) > 16 * 1024) {
    await response.body?.cancel();
    throw new Error("SMS response invalid");
  }
  const raw = await readBoundedUtf8(response.body, 16 * 1024);
  if (raw === null || raw === "") throw new Error("SMS response invalid");
  const body = parseStrictJson(raw);
  if (body === null) throw new Error("SMS response invalid");
  return { status: response.status, body };
}
