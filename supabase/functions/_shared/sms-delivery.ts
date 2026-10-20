import { parseSmsOutcome, resolveSmsProvider } from "./sms-provider.ts";
import type { SmsOutcome, SmsProvider } from "./sms-provider.ts";
import { supabaseRpc } from "./supabase-rest.ts";
import type { SupabaseServerConfig } from "./supabase-rest.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROVIDER_ID = /^[a-z][a-z0-9_-]{1,39}$/;
const TEMPLATE_ID = /^[A-Za-z0-9._:-]{1,100}$/;
const TRACKING_CODE = /^[A-Z][A-Z0-9]{1,9}-[1-9][0-9]{3,}$/;
const COMPLETION_CODES = ["ACCEPTED", "RETRY_SCHEDULED", "FAILED", "UNCERTAIN", "EXPIRED", "STALE"];

interface Claim {
  readonly request_id: string;
  readonly provider_id: string;
  readonly template_id: string;
  readonly locale: "fa" | "en";
  readonly attempt: number;
  readonly lease_token: string;
  readonly lease_until: string;
}

export interface SmsDeliverySummary {
  readonly state: "disabled" | "unconfigured" | "processed";
  readonly claimed: number;
  readonly accepted: number;
  readonly retryScheduled: number;
  readonly uncertain: number;
  readonly terminal: number;
  readonly completionFailures: number;
}

export interface SmsDeliveryDependencies {
  readonly readEnv: (name: string) => string | undefined;
  readonly resolveProvider: (id: string) => SmsProvider | null;
  readonly rpc: <T>(
    config: SupabaseServerConfig,
    name: string,
    body: Readonly<Record<string, unknown>>,
  ) => Promise<T>;
  readonly now: () => number;
}

const defaults: SmsDeliveryDependencies = {
  readEnv: (name) => Deno.env.get(name),
  resolveProvider: resolveSmsProvider,
  rpc: supabaseRpc,
  now: () => Date.now(),
};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function claim(value: unknown, providerId: string, now: number): Claim | null {
  const allowed = [
    "request_id",
    "provider_id",
    "template_id",
    "locale",
    "attempt",
    "lease_token",
    "lease_until",
  ];
  if (
    !record(value) ||
    Object.keys(value).length !== allowed.length ||
    !Object.keys(value).every((k) => allowed.includes(k)) ||
    typeof value.request_id !== "string" ||
    !UUID.test(value.request_id) ||
    value.provider_id !== providerId ||
    typeof value.template_id !== "string" ||
    !TEMPLATE_ID.test(value.template_id) ||
    (value.locale !== "fa" && value.locale !== "en") ||
    typeof value.attempt !== "number" ||
    !Number.isInteger(value.attempt) ||
    value.attempt < 1 ||
    value.attempt > 3 ||
    typeof value.lease_token !== "string" ||
    !UUID.test(value.lease_token) ||
    typeof value.lease_until !== "string" ||
    value.lease_until.length > 40 ||
    !Number.isFinite(Date.parse(value.lease_until)) ||
    Date.parse(value.lease_until) <= now ||
    Date.parse(value.lease_until) > now + 125_000
  )
    return null;
  return {
    request_id: value.request_id,
    provider_id: providerId,
    template_id: value.template_id,
    locale: value.locale,
    attempt: value.attempt,
    lease_token: value.lease_token,
    lease_until: value.lease_until,
  };
}

function empty(state: SmsDeliverySummary["state"]): SmsDeliverySummary {
  return {
    state,
    claimed: 0,
    accepted: 0,
    retryScheduled: 0,
    uncertain: 0,
    terminal: 0,
    completionFailures: 0,
  };
}

async function processSms(
  config: SupabaseServerConfig,
  requestId: string | null,
  deps: SmsDeliveryDependencies,
): Promise<SmsDeliverySummary> {
  const enabled = deps.readEnv("SMS_DELIVERY_ENABLED");
  if (enabled === undefined || enabled === "" || enabled === "false") return empty("disabled");
  const providerId = deps.readEnv("SMS_PROVIDER_ID") ?? "";
  if (enabled !== "true" || !PROVIDER_ID.test(providerId)) return empty("unconfigured");
  const provider = deps.resolveProvider(providerId);
  if (provider === null || provider.id !== providerId) return empty("unconfigured");
  if (requestId !== null && !UUID.test(requestId))
    throw new Error("SMS request identifier invalid");
  const limit = requestId === null ? 5 : 1;
  const raw = await deps.rpc<unknown>(config, "claim_sms_notifications", {
    p_provider_id: providerId,
    p_limit: limit,
    p_request_id: requestId,
  });
  if (
    !record(raw) ||
    Object.keys(raw).length !== 2 ||
    !Array.isArray(raw.items) ||
    (raw.code !== "CLAIMED" && raw.code !== "DISABLED") ||
    raw.items.length > limit ||
    (raw.code === "DISABLED" && raw.items.length !== 0)
  )
    throw new Error("SMS claim invalid");
  if (raw.code === "DISABLED") return empty("disabled");
  const items = raw.items.map((item) => claim(item, providerId, deps.now()));
  if (
    items.some((item) => item === null) ||
    new Set(items.map((item) => item?.request_id)).size !== items.length ||
    (requestId !== null && items.some((item) => item?.request_id !== requestId))
  )
    throw new Error("SMS claim invalid");
  const result = { ...empty("processed"), claimed: items.length };

  async function deliver(item: Claim): Promise<void> {
    const lease = {
      p_request_id: item.request_id,
      p_attempt: item.attempt,
      p_lease_token: item.lease_token,
    };
    try {
      // Recheck the DB kill switch and anonymization immediately before I/O.
      const auth = await deps.rpc<unknown>(config, "authorize_sms_attempt", lease);
      if (!record(auth)) throw new Error("SMS authorization invalid");
      if ((auth.code === "CANCELLED" || auth.code === "STALE") && Object.keys(auth).length === 1) {
        result.terminal += 1;
        return;
      }
      if (
        Object.keys(auth).length !== 3 ||
        auth.code !== "SEND_ALLOWED" ||
        typeof auth.phone !== "string" ||
        !/^\+989[0-9]{9}$/.test(auth.phone) ||
        typeof auth.tracking_code !== "string" ||
        !TRACKING_CODE.test(auth.tracking_code)
      )
        throw new Error("SMS authorization invalid");
      // Leave enough lease for the 8s send and 8s completion. Expired/crashed
      // sends become uncertain in DB recovery, never automatically retried.
      if (Date.parse(item.lease_until) - deps.now() <= 20_000)
        throw new Error("SMS lease too short");
      let outcome: SmsOutcome;
      try {
        outcome = parseSmsOutcome(
          await provider!.send(
            {
              event: "request_received",
              to: auth.phone,
              locale: item.locale,
              templateId: item.template_id,
              parameters: { tracking_code: auth.tracking_code },
              idempotencyKey: `receipt:${item.request_id}`,
            },
            AbortSignal.timeout(8_000),
          ),
        );
      } catch {
        outcome = { kind: "uncertain" };
      }
      const completed = await deps.rpc<unknown>(config, "complete_sms_notification", {
        ...lease,
        p_outcome: outcome.kind,
        p_provider_receipt: outcome.kind === "accepted" ? outcome.receipt : null,
        p_retry_after_seconds: outcome.kind === "retryable" ? outcome.retryAfterSeconds : null,
      });
      if (
        !record(completed) ||
        Object.keys(completed).length !== 1 ||
        typeof completed.code !== "string" ||
        !COMPLETION_CODES.includes(completed.code) ||
        completed.code === "STALE"
      )
        throw new Error("SMS completion invalid");
      const expected =
        outcome.kind === "accepted"
          ? ["ACCEPTED"]
          : outcome.kind === "uncertain"
            ? ["UNCERTAIN"]
            : outcome.kind === "permanent_failure"
              ? ["FAILED"]
              : ["RETRY_SCHEDULED", "FAILED", "EXPIRED"];
      if (!expected.includes(completed.code)) throw new Error("SMS completion invalid");
      if (completed.code === "ACCEPTED") result.accepted += 1;
      else if (completed.code === "RETRY_SCHEDULED") result.retryScheduled += 1;
      else if (completed.code === "UNCERTAIN") result.uncertain += 1;
      else result.terminal += 1;
    } catch {
      // Never print provider errors, recipient data, request identifiers or body.
      result.completionFailures += 1;
    }
  }

  // Bounded independent work. With 5 jobs / 2 workers, 8s RPCs and 8s send,
  // normal completion fits the 2-minute lease and existing 105s recovery call.
  const valid = items.filter((item): item is Claim => item !== null);
  for (let index = 0; index < valid.length; index += 2) {
    await Promise.all(valid.slice(index, index + 2).map(deliver));
  }
  return result;
}

export function processSmsByRequestId(
  config: SupabaseServerConfig,
  requestId: string,
  deps: SmsDeliveryDependencies = defaults,
): Promise<SmsDeliverySummary> {
  return processSms(config, requestId, deps);
}

export function processSmsRecoveryBatch(
  config: SupabaseServerConfig,
  deps: SmsDeliveryDependencies = defaults,
): Promise<SmsDeliverySummary> {
  return processSms(config, null, deps);
}
