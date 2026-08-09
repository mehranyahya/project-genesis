import { sha256Hex, uuidV5 } from "./crypto.ts";
import type { BotVerification, RiskFlag } from "./request-contract.ts";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const SITEVERIFY_TIMEOUT_MS = 5_000;
const HOSTNAME_PATTERN =
  /^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)*[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;

interface TurnstileConfig {
  readonly secret: string;
  readonly hostnames: ReadonlySet<string>;
  readonly action: string;
  readonly namespaceUuid: string;
}

interface SiteverifyResponse {
  readonly success?: unknown;
  readonly hostname?: unknown;
  readonly action?: unknown;
  readonly "error-codes"?: unknown;
}

export type TurnstileResult =
  | {
      readonly kind: "accepted";
      readonly botVerification: BotVerification;
      readonly riskFlags: readonly RiskFlag[];
    }
  | { readonly kind: "invalid" }
  | { readonly kind: "configuration_error" };

function readConfig(): TurnstileConfig | null {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY")?.trim() ?? "";
  const rawHostnames = Deno.env.get("TURNSTILE_ALLOWED_HOSTNAMES")?.trim() ?? "";
  const action = Deno.env.get("TURNSTILE_EXPECTED_ACTION")?.trim() ?? "";
  const namespaceUuid = Deno.env.get("SITEVERIFY_NAMESPACE_UUID")?.trim() ?? "";
  if (secret === "" || rawHostnames === "" || action !== "submit_request") return null;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      namespaceUuid,
    )
  ) {
    return null;
  }
  const hostnames = rawHostnames
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (
    hostnames.length === 0 ||
    new Set(hostnames).size !== hostnames.length ||
    hostnames.some((hostname) => !HOSTNAME_PATTERN.test(hostname))
  ) {
    return null;
  }
  return { secret, hostnames: new Set(hostnames), action, namespaceUuid };
}

async function oneAttempt(
  config: TurnstileConfig,
  token: string,
  idempotencyKey: string,
): Promise<{ kind: "response"; value: SiteverifyResponse } | { kind: "transport_failure" }> {
  const body = new FormData();
  body.set("secret", config.secret);
  body.set("response", token);
  body.set("idempotency_key", idempotencyKey);

  let response: Response;
  try {
    response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS),
    });
  } catch {
    return { kind: "transport_failure" };
  }

  if (response.status >= 500) return { kind: "transport_failure" };
  if (!response.ok) return { kind: "transport_failure" };
  try {
    return { kind: "response", value: (await response.json()) as SiteverifyResponse };
  } catch {
    return { kind: "transport_failure" };
  }
}

export async function verifyTurnstile(input: {
  readonly token: string | null;
  readonly submissionId: string;
  readonly fastSubmitSignal: boolean;
}): Promise<TurnstileResult> {
  const config = readConfig();
  if (config === null) return { kind: "configuration_error" };

  if (input.token === null) {
    const riskFlags: RiskFlag[] = ["turnstile_no_token"];
    if (input.fastSubmitSignal) riskFlags.push("fast_submit_signal");
    return {
      kind: "accepted",
      botVerification: "unverified_no_token",
      riskFlags,
    };
  }

  const tokenHash = await sha256Hex(input.token);
  const idempotencyKey = await uuidV5(config.namespaceUuid, `${input.submissionId}:${tokenHash}`);

  let result = await oneAttempt(config, input.token, idempotencyKey);
  if (result.kind === "transport_failure") {
    result = await oneAttempt(config, input.token, idempotencyKey);
  }
  if (result.kind === "transport_failure") {
    const riskFlags: RiskFlag[] = ["turnstile_unavailable"];
    if (input.fastSubmitSignal) riskFlags.push("fast_submit_signal");
    return {
      kind: "accepted",
      botVerification: "unverified_service_error",
      riskFlags,
    };
  }

  const value = result.value;
  if (value.success !== true) return { kind: "invalid" };
  if (typeof value.hostname !== "string" || !config.hostnames.has(value.hostname.toLowerCase())) {
    return { kind: "invalid" };
  }
  if (value.action !== config.action) return { kind: "invalid" };

  const riskFlags: RiskFlag[] = [];
  if (input.fastSubmitSignal) riskFlags.push("fast_submit_signal");
  return { kind: "accepted", botVerification: "verified", riskFlags };
}
