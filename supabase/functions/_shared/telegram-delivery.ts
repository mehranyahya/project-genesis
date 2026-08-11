import { parseStrictJson, readBoundedUtf8 } from "./json.ts";
import { supabaseRpc } from "./supabase-rest.ts";
import type { SupabaseServerConfig } from "./supabase-rest.ts";

const TELEGRAM_TIMEOUT_MS = 8_000;
const TELEGRAM_RESPONSE_LIMIT = 16 * 1024;
const MAX_TELEGRAM_TEXT_LENGTH = 3_900;
const MAX_FIELD_LENGTH = 600;
const RECOVERY_CONCURRENCY = 5;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TRACKING_PATTERN = /^[A-Z][A-Z0-9]{1,9}-[1-9][0-9]{3,}$/;

interface TelegramConfig {
  readonly botToken: string;
  readonly adminChatId: string;
}

interface ClaimItem {
  readonly request_id: string;
  readonly tracking_code: string;
  readonly request_type: "grave_stone" | "building_stone" | "contact";
  readonly customer_name: string | null;
  readonly phone: string | null;
  readonly city: string | null;
  readonly location_text: string | null;
  readonly preferred_contact: string | null;
  readonly preferred_contact_time: string | null;
  readonly customer_note: string | null;
  readonly configuration: Readonly<Record<string, unknown>>;
  readonly price: Readonly<Record<string, unknown>> | null;
  readonly needs_review: boolean;
  readonly attempt: number;
  readonly lease_until: string;
  readonly created_at: string;
}

type DeliveryOutcome =
  | { readonly kind: "sent" }
  | { readonly kind: "retryable"; readonly retryAfterSeconds: number | null }
  | { readonly kind: "permanent_failure" };

export interface TelegramDeliverySummary {
  readonly claimed: number;
  readonly completed: number;
  readonly failedToComplete: number;
}

function readConfig(): TelegramConfig | null {
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN")?.trim() ?? "";
  const adminChatId = Deno.env.get("TELEGRAM_ADMIN_CHAT_ID")?.trim() ?? "";
  if (!/^[0-9]{5,}:[A-Za-z0-9_-]{20,}$/.test(botToken) || !/^-?[0-9]{1,20}$/.test(adminChatId)) {
    return null;
  }
  return { botToken, adminChatId };
}

function nullableBoundedString(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && value.length <= 4_000);
}

function record(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseClaimItem(value: unknown): ClaimItem | null {
  if (!record(value)) return null;
  const allowed = new Set([
    "request_id",
    "tracking_code",
    "request_type",
    "customer_name",
    "phone",
    "city",
    "location_text",
    "preferred_contact",
    "preferred_contact_time",
    "customer_note",
    "configuration",
    "price",
    "needs_review",
    "attempt",
    "lease_until",
    "created_at",
  ]);
  if (
    Object.keys(value).length !== allowed.size ||
    !Object.keys(value).every((key) => allowed.has(key))
  ) {
    return null;
  }
  if (
    typeof value.request_id !== "string" ||
    !UUID_PATTERN.test(value.request_id) ||
    typeof value.tracking_code !== "string" ||
    !TRACKING_PATTERN.test(value.tracking_code) ||
    (value.request_type !== "grave_stone" &&
      value.request_type !== "building_stone" &&
      value.request_type !== "contact") ||
    !nullableBoundedString(value.customer_name) ||
    !nullableBoundedString(value.phone) ||
    !nullableBoundedString(value.city) ||
    !nullableBoundedString(value.location_text) ||
    !nullableBoundedString(value.preferred_contact) ||
    !nullableBoundedString(value.preferred_contact_time) ||
    !nullableBoundedString(value.customer_note) ||
    !record(value.configuration) ||
    (value.price !== null && !record(value.price)) ||
    typeof value.needs_review !== "boolean" ||
    typeof value.attempt !== "number" ||
    !Number.isInteger(value.attempt) ||
    value.attempt < 1 ||
    value.attempt > 5 ||
    typeof value.lease_until !== "string" ||
    value.lease_until.length < 1 ||
    value.lease_until.length > 80 ||
    typeof value.created_at !== "string" ||
    value.created_at.length < 1 ||
    value.created_at.length > 80
  ) {
    return null;
  }
  return value as unknown as ClaimItem;
}

async function claimNotifications(
  supabase: SupabaseServerConfig,
  limit: number,
  requestId: string | null,
): Promise<readonly ClaimItem[]> {
  const raw = await supabaseRpc<unknown>(supabase, "claim_telegram_notifications", {
    p_limit: limit,
    p_request_id: requestId,
  });
  if (
    !record(raw) ||
    Object.keys(raw).length !== 2 ||
    raw.code !== "CLAIMED" ||
    !Array.isArray(raw.items)
  ) {
    throw new Error("Telegram delivery claim was malformed");
  }
  if (raw.items.length > limit) throw new Error("Telegram delivery claim exceeded its limit");
  const items = raw.items.map(parseClaimItem);
  if (items.some((item) => item === null)) throw new Error("Telegram delivery item was malformed");
  return items as ClaimItem[];
}

async function completeNotification(
  supabase: SupabaseServerConfig,
  item: ClaimItem,
  outcome: DeliveryOutcome,
): Promise<void> {
  const raw = await supabaseRpc<unknown>(supabase, "complete_telegram_notification", {
    p_request_id: item.request_id,
    p_attempt: item.attempt,
    p_outcome: outcome.kind,
    p_retry_after_seconds: outcome.kind === "retryable" ? outcome.retryAfterSeconds : null,
  });
  if (!record(raw) || typeof raw.code !== "string") {
    throw new Error("Telegram delivery completion was malformed");
  }
  if (!["SENT", "FAILED", "STALE", "RETRY_SCHEDULED"].includes(raw.code)) {
    throw new Error("Telegram delivery completion failed");
  }
}

function sanitizePlainText(value: string): string {
  let result = "";
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code >= 32 || code === 9 || code === 10 || code === 13) result += character;
  }
  return result.trim().slice(0, MAX_FIELD_LENGTH);
}

function stringValue(source: Readonly<Record<string, unknown>>, key: string): string | null {
  const value = source[key];
  return typeof value === "string" && value.trim() !== "" ? sanitizePlainText(value) : null;
}

function numericValue(source: Readonly<Record<string, unknown>>, key: string): number | null {
  const value = source[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function optionIds(source: Readonly<Record<string, unknown>>): string | null {
  const value = source["selected_option_ids"];
  if (!Array.isArray(value)) return null;
  const items = value
    .filter((item): item is string => typeof item === "string")
    .map(sanitizePlainText)
    .filter(Boolean)
    .slice(0, 12);
  return items.length === 0 ? null : items.join("، ");
}

function appendLine(lines: string[], label: string, value: string | null): void {
  if (value !== null && value !== "") lines.push(`${label}: ${value}`);
}

export function formatTelegramAdminMessage(item: ClaimItem): string {
  const lines = ["درخواست جدید"];
  appendLine(lines, "کد پیگیری", item.tracking_code);
  appendLine(lines, "نوع درخواست", item.request_type);
  appendLine(
    lines,
    "نام",
    item.customer_name === null ? null : sanitizePlainText(item.customer_name),
  );
  appendLine(lines, "موبایل", item.phone === null ? null : sanitizePlainText(item.phone));
  if (item.phone?.startsWith("+98"))
    appendLine(lines, "واتساپ", `https://wa.me/${item.phone.slice(1)}`);
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
    const price = numericValue(item.price, "server_calculated_price");
    if (price !== null) appendLine(lines, "قیمت سرور (تومان)", String(price));
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

function retryAfter(payload: unknown): number | null {
  if (!record(payload) || !record(payload.parameters)) return null;
  const value = payload.parameters.retry_after;
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 86_400
    ? value
    : null;
}

async function sendTelegramMessage(
  config: TelegramConfig,
  item: ClaimItem,
): Promise<DeliveryOutcome> {
  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: config.adminChatId,
        text: formatTelegramAdminMessage(item),
        link_preview_options: { is_disabled: true },
      }),
      redirect: "error",
      signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
    });
  } catch {
    return { kind: "retryable", retryAfterSeconds: null };
  }

  const raw = await readBoundedUtf8(response.body, TELEGRAM_RESPONSE_LIMIT);
  const payload = raw === null ? null : parseStrictJson(raw);
  const wait = retryAfter(payload);
  if (response.status === 429) return { kind: "retryable", retryAfterSeconds: wait };
  if (response.status >= 500) return { kind: "retryable", retryAfterSeconds: null };
  if (response.status >= 400) return { kind: "permanent_failure" };
  if (!record(payload) || typeof payload.ok !== "boolean") {
    return { kind: "retryable", retryAfterSeconds: null };
  }
  if (payload.ok) return { kind: "sent" };
  if (payload.error_code === 429) return { kind: "retryable", retryAfterSeconds: wait };
  if (typeof payload.error_code === "number" && payload.error_code >= 500) {
    return { kind: "retryable", retryAfterSeconds: null };
  }
  return { kind: "permanent_failure" };
}

async function processItem(
  config: TelegramConfig,
  supabase: SupabaseServerConfig,
  item: ClaimItem,
): Promise<boolean> {
  try {
    const outcome = await sendTelegramMessage(config, item);
    await completeNotification(supabase, item, outcome);
    return true;
  } catch {
    return false;
  }
}

async function processItems(
  config: TelegramConfig,
  supabase: SupabaseServerConfig,
  items: readonly ClaimItem[],
): Promise<TelegramDeliverySummary> {
  let cursor = 0;
  let completed = 0;
  let failedToComplete = 0;
  const worker = async (): Promise<void> => {
    while (true) {
      const item = items[cursor];
      cursor += 1;
      if (item === undefined) return;
      if (await processItem(config, supabase, item)) completed += 1;
      else failedToComplete += 1;
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(RECOVERY_CONCURRENCY, items.length) }, () => worker()),
  );
  return { claimed: items.length, completed, failedToComplete };
}

function requireConfig(): TelegramConfig {
  const config = readConfig();
  if (config === null) throw new Error("Telegram delivery configuration is incomplete");
  return config;
}

export async function processTelegramByRequestId(
  supabase: SupabaseServerConfig,
  requestId: string,
): Promise<TelegramDeliverySummary> {
  if (!UUID_PATTERN.test(requestId)) throw new Error("Telegram delivery request id is invalid");
  const config = requireConfig();
  return processItems(config, supabase, await claimNotifications(supabase, 1, requestId));
}

export async function processTelegramRecoveryBatch(
  supabase: SupabaseServerConfig,
): Promise<TelegramDeliverySummary> {
  const config = requireConfig();
  return processItems(config, supabase, await claimNotifications(supabase, 25, null));
}
