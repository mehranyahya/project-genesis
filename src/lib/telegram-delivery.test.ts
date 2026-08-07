import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  processTelegramByTrackingCode,
  processTelegramRecoveryBatch,
  readTelegramDeliveryConfig,
} from "./telegram-delivery.server";
import {
  attachTelegramDeliverySignal,
  consumeTelegramDeliverySignal,
  TELEGRAM_DELIVERY_SIGNAL_HEADER,
} from "./telegram-delivery.signal";

const env = {
  SUPABASE_URL: "https://project-ref.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-secret-for-tests",
  TELEGRAM_BOT_TOKEN: "123456:abcdefghijklmnopqrstuvwxyzABCDE12345",
  TELEGRAM_ADMIN_CHAT_ID: "-1001234567890",
};

const requestId = "11111111-1111-4111-8111-111111111111";

const claimItem = {
  request_id: requestId,
  tracking_code: "MA-1001",
  request_type: "grave_stone",
  customer_name: "مشتری تست",
  phone: "+989121234567",
  city: "اصفهان",
  location_text: "باغ رضوان",
  preferred_contact: "whatsapp",
  preferred_contact_time: null,
  customer_note: "یادداشت سفارش",
  configuration: {
    product_code: "MHR-001",
    stone_code: "natanz",
    size_code: "180x60",
    selected_option_ids: ["opt-1"],
  },
  price: {
    price_type: "fixed",
    server_calculated_price: 25000000,
  },
  needs_review: false,
  attempt: 1,
  lease_until: "2026-08-07T20:00:00Z",
  created_at: "2026-08-07T19:58:00Z",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function fetchMock(
  handler: (url: string, init: RequestInit | undefined) => Promise<Response> | Response,
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) =>
    handler(String(input), init)) as typeof fetch;
}

test("Telegram delivery configuration is server-complete or rejected before network access", async () => {
  assert.equal(readTelegramDeliveryConfig({}), null);
  let calls = 0;
  await assert.rejects(
    processTelegramRecoveryBatch(
      {},
      {
        fetch: fetchMock(() => {
          calls += 1;
          return json({});
        }),
      },
    ),
    /configuration is incomplete/,
  );
  assert.equal(calls, 0);
});

test("only REQUEST_CREATED receives an internal Telegram delivery signal", async () => {
  const created = await attachTelegramDeliverySignal(
    json({ code: "REQUEST_CREATED", tracking_code: "MA-1001" }, 201),
  );
  assert.equal(created.headers.get(TELEGRAM_DELIVERY_SIGNAL_HEADER), "MA-1001");

  const replayed = await attachTelegramDeliverySignal(
    json({ code: "REQUEST_REPLAYED", tracking_code: "MA-1001" }, 200),
  );
  assert.equal(replayed.headers.get(TELEGRAM_DELIVERY_SIGNAL_HEADER), null);

  const consumed = consumeTelegramDeliverySignal(created);
  assert.equal(consumed.trackingCode, "MA-1001");
  assert.equal(consumed.response.headers.get(TELEGRAM_DELIVERY_SIGNAL_HEADER), null);
  assert.deepEqual(await consumed.response.json(), {
    code: "REQUEST_CREATED",
    tracking_code: "MA-1001",
  });
});

test("successful Telegram send completes the claimed request without parse mode", async () => {
  const calls: Array<{ url: string; body: unknown }> = [];
  const mock = fetchMock(async (url, init) => {
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    calls.push({ url, body });

    if (url.endsWith("/rpc/claim_telegram_notifications")) {
      return json({ code: "CLAIMED", items: [claimItem] });
    }
    if (url.includes("api.telegram.org/")) return json({ ok: true, result: {} });
    if (url.endsWith("/rpc/complete_telegram_notification")) return json({ code: "SENT" });
    throw new Error("Unexpected request");
  });

  const summary = await processTelegramRecoveryBatch(env, { fetch: mock });
  assert.deepEqual(summary, { claimed: 1, completed: 1, failedToComplete: 0 });

  const claim = calls[0]?.body as Record<string, unknown>;
  assert.deepEqual(claim, { p_limit: 25, p_request_id: null });

  const telegram = calls.find((call) => call.url.includes("api.telegram.org/"));
  assert.ok(telegram);
  const telegramBody = telegram.body as Record<string, unknown>;
  assert.equal(telegramBody["chat_id"], env.TELEGRAM_ADMIN_CHAT_ID);
  assert.equal("parse_mode" in telegramBody, false);
  assert.deepEqual(telegramBody["link_preview_options"], { is_disabled: true });
  assert.match(String(telegramBody["text"]), /MA-1001/);
  assert.match(String(telegramBody["text"]), /\+989121234567/);
  assert.ok(String(telegramBody["text"]).length <= 3900);

  const complete = calls.at(-1)?.body as Record<string, unknown>;
  assert.equal(complete["p_outcome"], "sent");
  assert.equal(complete["p_retry_after_seconds"], null);
});

test("Telegram 429 retry_after is persisted through the completion RPC", async () => {
  let completionBody: Record<string, unknown> | null = null;
  const mock = fetchMock(async (url, init) => {
    if (url.endsWith("/rpc/claim_telegram_notifications")) {
      return json({ code: "CLAIMED", items: [claimItem] });
    }
    if (url.includes("api.telegram.org/")) {
      return json({ ok: false, error_code: 429, parameters: { retry_after: 17 } }, 429);
    }
    if (url.endsWith("/rpc/complete_telegram_notification")) {
      completionBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return json({ code: "RETRY_SCHEDULED", next_attempt_at: "2026-08-07T21:00:00Z" });
    }
    throw new Error("Unexpected request");
  });

  await processTelegramRecoveryBatch(env, { fetch: mock });
  assert.equal(completionBody?.["p_outcome"], "retryable");
  assert.equal(completionBody?.["p_retry_after_seconds"], 17);
});

test("immediate delivery resolves the created tracking code to one exact request id", async () => {
  const calls: Array<{ url: string; body: unknown }> = [];
  const mock = fetchMock(async (url, init) => {
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    calls.push({ url, body });

    if (url.includes("/rest/v1/requests?")) return json([{ id: requestId }]);
    if (url.endsWith("/rpc/claim_telegram_notifications")) {
      return json({ code: "CLAIMED", items: [] });
    }
    throw new Error("Unexpected request");
  });

  const summary = await processTelegramByTrackingCode(env, "MA-1001", { fetch: mock });
  assert.deepEqual(summary, { claimed: 0, completed: 0, failedToComplete: 0 });
  const lookup = new URL(calls[0]?.url ?? "");
  assert.equal(lookup.searchParams.get("tracking_code"), "eq.MA-1001");
  assert.deepEqual(calls[1]?.body, { p_limit: 1, p_request_id: requestId });
});

test("Worker source strips the signal, uses waitUntil, and exposes hourly recovery", () => {
  const server = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
  const route = readFileSync(new URL("request-api.route.server.ts", import.meta.url), "utf8");
  const delivery = readFileSync(new URL("telegram-delivery.server.ts", import.meta.url), "utf8");
  const envExample = readFileSync(new URL("../../.env.example", import.meta.url), "utf8");

  assert.match(route, /attachTelegramDeliverySignal\(response\)/);
  assert.match(server, /consumeTelegramDeliverySignal\(normalized\)/);
  assert.match(server, /execution\.waitUntil\(/);
  assert.match(server, /processTelegramByTrackingCode\(env, trackingCode\)/);
  assert.match(server, /TELEGRAM_RECOVERY_CRON = "0 \* \* \* \*"/);
  assert.match(server, /await processTelegramRecoveryBatch\(env\)/);
  assert.match(delivery, /p_limit: limit, p_request_id: requestId/);
  assert.match(delivery, /claimNotifications\(config, dependencies, 25, null\)/);
  assert.doesNotMatch(delivery, /console\.(log|info|warn|error)/);
  assert.doesNotMatch(delivery, /parse_mode/);
  assert.match(envExample, /^TELEGRAM_BOT_TOKEN=$/m);
  assert.match(envExample, /^TELEGRAM_ADMIN_CHAT_ID=$/m);
});
