import { z } from "zod";

import { isTelegramTrackingCode } from "./telegram-delivery.signal";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_TELEGRAM_TEXT_LENGTH = 3_900;
const MAX_FIELD_LENGTH = 600;

const requestIdSchema = z.string().uuid();

const claimItemSchema = z
  .object({
    request_id: requestIdSchema,
    tracking_code: z.string().regex(/^MA-[1-9][0-9]{3,}$/),
    request_type: z.enum(["grave_stone", "building_stone", "contact"]),
    customer_name: z.string().nullable(),
    phone: z.string().nullable(),
    city: z.string().nullable(),
    location_text: z.string().nullable(),
    preferred_contact: z.string().nullable(),
    preferred_contact_time: z.string().nullable(),
    customer_note: z.string().nullable(),
    configuration: z.record(z.unknown()),
    price: z.record(z.unknown()).nullable(),
    needs_review: z.boolean(),
    attempt: z.number().int().min(1).max(5),
    lease_until: z.string().min(1),
    created_at: z.string().min(1),
  })
  .strict();

const claimResultSchema = z.union([
  z.object({ code: z.literal("CLAIMED"), items: z.array(claimItemSchema).max(25) }).strict(),
  z.object({ code: z.literal("VALIDATION_ERROR") }).strict(),
]);

const completeResultSchema = z.union([
  z.object({ code: z.enum(["SENT", "FAILED", "STALE", "NOT_FOUND", "VALIDATION_ERROR"]) }).strict(),
  z
    .object({
      code: z.literal("RETRY_SCHEDULED"),
      next_attempt_at: z.string().min(1),
    })
    .strict(),
]);

const requestLookupSchema = z.array(z.object({ id: requestIdSchema }).strict()).max(1);

const telegramApiResponseSchema = z
  .object({
    ok: z.boolean(),
    error_code: z.number().int().optional(),
    parameters: z
      .object({
        retry_after: z.number().int().positive().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export interface TelegramDeliveryConfig {
  readonly supabaseUrl: string;
  readonly serviceRoleKey: string;
  readonly botToken: string;
  readonly adminChatId: string;
}

export interface TelegramDeliveryDependencies {
  readonly fetch: typeof fetch;
}

export interface TelegramDeliverySummary {
  readonly claimed: number;
  readonly completed: number;
  readonly failedToComplete: number;
}

type DeliveryOutcome =
  | { readonly kind: "sent" }
  | { readonly kind: "retryable"; readonly retryAfterSeconds: number | null }
  | { readonly kind: "permanent_failure" };

type ClaimItem = z.infer<typeof claimItemSchema>;

const defaultDependencies: TelegramDeliveryDependencies = { fetch };

function envString(env: unknown, key: string): string | null {
  if (env === null || typeof env !== "object") return null;
  const value = (env as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export function readTelegramDeliveryConfig(env: unknown): TelegramDeliveryConfig | null {
  const rawUrl = envString(env, "SUPABASE_URL");
  const serviceRoleKey = envString(env, "SUPABASE_SERVICE_ROLE_KEY");
  const botToken = envString(env, "TELEGRAM_BOT_TOKEN");
  const adminChatId = envString(env, "TELEGRAM_ADMIN_CHAT_ID");

  if (!rawUrl || !serviceRoleKey || !botToken || !adminChatId) return null;
  if (!/^[0-9]{5,}:[A-Za-z0-9_-]{20,}$/.test(botToken)) return null;
  if (!/^-?[0-9]{1,20}$/.test(adminChatId)) return null;

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;

  return {
    supabaseUrl: parsed.origin,
    serviceRoleKey,
    botToken,
    adminChatId,
  };
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  input: string | URL,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetchImpl(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function supabaseHeaders(config: TelegramDeliveryConfig): HeadersInit {
  return {
    apikey: config.serviceRoleKey,
    authorization: `Bearer ${config.serviceRoleKey}`,
    "content-type": "application/json",
  };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function callSupabaseRpc(
  config: TelegramDeliveryConfig,
  functionName: string,
  body: Record<string, unknown>,
  dependencies: TelegramDeliveryDependencies,
): Promise<unknown> {
  const response = await fetchWithTimeout(
    dependencies.fetch,
    `${config.supabaseUrl}/rest/v1/rpc/${functionName}`,
    {
      method: "POST",
      headers: supabaseHeaders(config),
      body: JSON.stringify(body),
    },
  );
  if (!response.ok) throw new Error("Telegram delivery database RPC failed");
  return readJson(response);
}

async function lookupRequestId(
  config: TelegramDeliveryConfig,
  trackingCode: string,
  dependencies: TelegramDeliveryDependencies,
): Promise<string | null> {
  const url = new URL("/rest/v1/requests", config.supabaseUrl);
  url.searchParams.set("select", "id");
  url.searchParams.set("tracking_code", `eq.${trackingCode}`);
  url.searchParams.set("limit", "1");

  const response = await fetchWithTimeout(dependencies.fetch, url, {
    method: "GET",
    headers: supabaseHeaders(config),
  });
  if (!response.ok) throw new Error("Telegram delivery request lookup failed");

  const parsed = requestLookupSchema.safeParse(await readJson(response));
  if (!parsed.success) throw new Error("Telegram delivery request lookup was malformed");
  return parsed.data[0]?.id ?? null;
}

async function claimNotifications(
  config: TelegramDeliveryConfig,
  dependencies: TelegramDeliveryDependencies,
  limit: number,
  requestId: string | null,
): Promise<readonly ClaimItem[]> {
  const raw = await callSupabaseRpc(
    config,
    "claim_telegram_notifications",
    { p_limit: limit, p_request_id: requestId },
    dependencies,
  );
  const parsed = claimResultSchema.safeParse(raw);
  if (!parsed.success || parsed.data.code !== "CLAIMED") {
    throw new Error("Telegram delivery claim failed validation");
  }
  return parsed.data.items;
}

async function completeNotification(
  config: TelegramDeliveryConfig,
  dependencies: TelegramDeliveryDependencies,
  item: ClaimItem,
  outcome: DeliveryOutcome,
): Promise<void> {
  const body: Record<string, unknown> = {
    p_request_id: item.request_id,
    p_attempt: item.attempt,
    p_outcome: outcome.kind,
    p_retry_after_seconds: outcome.kind === "retryable" ? outcome.retryAfterSeconds : null,
  };

  const raw = await callSupabaseRpc(config, "complete_telegram_notification", body, dependencies);
  const parsed = completeResultSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Telegram delivery completion was malformed");
  if (parsed.data.code === "VALIDATION_ERROR" || parsed.data.code === "NOT_FOUND") {
    throw new Error("Telegram delivery completion failed validation");
  }
}

function sanitizePlainText(value: string): string {
  let result = "";
  for (const character of value) {
    const code = character.charCodeAt(0);
    const isAllowedWhitespace = code === 9 || code === 10 || code === 13;
    if (code >= 32 || isAllowedWhitespace) result += character;
  }
  return result.trim().slice(0, MAX_FIELD_LENGTH);
}

function stringValue(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() !== "" ? sanitizePlainText(value) : null;
}

function numericValue(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function optionIds(record: Record<string, unknown>): string | null {
  const value = record["selected_option_ids"];
  if (!Array.isArray(value)) return null;
  const items = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => sanitizePlainText(item))
    .filter(Boolean)
    .slice(0, 12);
  return items.length > 0 ? items.join("، ") : null;
}

function appendLine(lines: string[], label: string, value: string | null): void {
  if (value !== null && value !== "") lines.push(`${label}: ${value}`);
}

export function formatTelegramAdminMessage(item: ClaimItem): string {
  const lines: string[] = ["درخواست جدید مهرآرا"];
  appendLine(lines, "کد پیگیری", item.tracking_code);
  appendLine(lines, "نوع درخواست", item.request_type);
  appendLine(
    lines,
    "نام",
    item.customer_name === null ? null : sanitizePlainText(item.customer_name),
  );
  appendLine(lines, "موبایل", item.phone === null ? null : sanitizePlainText(item.phone));
  if (item.phone?.startsWith("+98")) {
    appendLine(lines, "واتساپ", `https://wa.me/${item.phone.slice(1)}`);
  }
  appendLine(lines, "شهر", item.city === null ? null : sanitizePlainText(item.city));
  appendLine(
    lines,
    "محل",
    item.location_text === null ? null : sanitizePlainText(item.location_text),
  );
  appendLine(
    lines,
    "روش تماس",
    item.preferred_contact === null ? null : sanitizePlainText(item.preferred_contact),
  );
  appendLine(
    lines,
    "زمان تماس",
    item.preferred_contact_time === null ? null : sanitizePlainText(item.preferred_contact_time),
  );

  appendLine(lines, "کد محصول", stringValue(item.configuration, "product_code"));
  appendLine(lines, "کد سنگ", stringValue(item.configuration, "stone_code"));
  appendLine(lines, "اندازه", stringValue(item.configuration, "size_code"));
  appendLine(lines, "نوع سنگ ساختمانی", stringValue(item.configuration, "stone_type_code"));
  appendLine(lines, "کاربرد", stringValue(item.configuration, "application"));
  appendLine(lines, "گزینه‌ها", optionIds(item.configuration));

  if (item.price !== null) {
    appendLine(lines, "نوع قیمت", stringValue(item.price, "price_type"));
    const serverPrice = numericValue(item.price, "server_calculated_price");
    if (serverPrice !== null) appendLine(lines, "قیمت سرور (تومان)", String(serverPrice));
  }

  appendLine(lines, "نیاز به بررسی", item.needs_review ? "بله" : "خیر");
  appendLine(
    lines,
    "یادداشت",
    item.customer_note === null ? null : sanitizePlainText(item.customer_note),
  );

  const text = lines.join("\n");
  return text.length <= MAX_TELEGRAM_TEXT_LENGTH
    ? text
    : `${text.slice(0, MAX_TELEGRAM_TEXT_LENGTH - 1)}…`;
}

function telegramRetryAfter(payload: unknown): number | null {
  const parsed = telegramApiResponseSchema.safeParse(payload);
  if (!parsed.success) return null;
  return parsed.data.parameters?.retry_after ?? null;
}

async function sendTelegramMessage(
  config: TelegramDeliveryConfig,
  item: ClaimItem,
  dependencies: TelegramDeliveryDependencies,
): Promise<DeliveryOutcome> {
  let response: Response;
  try {
    response = await fetchWithTimeout(
      dependencies.fetch,
      `https://api.telegram.org/bot${config.botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: config.adminChatId,
          text: formatTelegramAdminMessage(item),
          link_preview_options: { is_disabled: true },
        }),
      },
    );
  } catch {
    return { kind: "retryable", retryAfterSeconds: null };
  }

  const payload = await readJson(response);
  const retryAfterSeconds = telegramRetryAfter(payload);

  if (response.status === 429) return { kind: "retryable", retryAfterSeconds };
  if (response.status >= 500) return { kind: "retryable", retryAfterSeconds: null };
  if (response.status >= 400) return { kind: "permanent_failure" };

  const parsed = telegramApiResponseSchema.safeParse(payload);
  if (!parsed.success) return { kind: "retryable", retryAfterSeconds: null };
  if (parsed.data.ok) return { kind: "sent" };
  if (parsed.data.error_code === 429) return { kind: "retryable", retryAfterSeconds };
  if ((parsed.data.error_code ?? 0) >= 500) {
    return { kind: "retryable", retryAfterSeconds: null };
  }
  return { kind: "permanent_failure" };
}

async function processClaimedItems(
  config: TelegramDeliveryConfig,
  items: readonly ClaimItem[],
  dependencies: TelegramDeliveryDependencies,
): Promise<TelegramDeliverySummary> {
  let completed = 0;
  let failedToComplete = 0;

  for (const item of items) {
    try {
      const outcome = await sendTelegramMessage(config, item, dependencies);
      await completeNotification(config, dependencies, item, outcome);
      completed += 1;
    } catch {
      failedToComplete += 1;
    }
  }

  if (failedToComplete > 0) throw new Error("Telegram delivery processing failed");
  return { claimed: items.length, completed, failedToComplete };
}

function requireConfig(env: unknown): TelegramDeliveryConfig {
  const config = readTelegramDeliveryConfig(env);
  if (config === null) throw new Error("Telegram delivery configuration is incomplete");
  return config;
}

export async function processTelegramByTrackingCode(
  env: unknown,
  trackingCode: string,
  dependencies: TelegramDeliveryDependencies = defaultDependencies,
): Promise<TelegramDeliverySummary> {
  if (!isTelegramTrackingCode(trackingCode)) {
    throw new Error("Telegram delivery tracking code is invalid");
  }

  const config = requireConfig(env);
  const requestId = await lookupRequestId(config, trackingCode, dependencies);
  if (requestId === null) return { claimed: 0, completed: 0, failedToComplete: 0 };

  const items = await claimNotifications(config, dependencies, 1, requestId);
  return processClaimedItems(config, items, dependencies);
}

export async function processTelegramRecoveryBatch(
  env: unknown,
  dependencies: TelegramDeliveryDependencies = defaultDependencies,
): Promise<TelegramDeliverySummary> {
  const config = requireConfig(env);
  const items = await claimNotifications(config, dependencies, 25, null);
  return processClaimedItems(config, items, dependencies);
}
