import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import {
  processTelegramByTrackingCode,
  processTelegramRecoveryBatch,
} from "./lib/telegram-delivery.server";
import { consumeTelegramDeliverySignal } from "./lib/telegram-delivery.signal";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

type WorkerExecutionContext = {
  waitUntil: (promise: Promise<unknown>) => void;
};

type WorkerScheduledController = {
  cron: string;
  scheduledTime: number;
};

export const TELEGRAM_RECOVERY_CRON = "0 * * * *";
export const PUBLIC_SUBMIT_MAX_BODY_BYTES = 16 * 1024;

const PUBLIC_SUBMIT_PATH = "/api/submit-request";

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

function gatewayValidationResponse(): Response {
  return new Response(JSON.stringify({ code: "VALIDATION_ERROR", field_errors: {} }), {
    status: 422,
    headers: {
      "cache-control": "no-store, max-age=0",
      "content-type": "application/json; charset=utf-8",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  });
}

function isPublicSubmitRequest(request: Request): boolean {
  if (request.method !== "POST") return false;
  try {
    return new URL(request.url).pathname === PUBLIC_SUBMIT_PATH;
  } catch {
    return false;
  }
}

export async function enforcePublicSubmitBodyLimit(request: Request): Promise<Response | null> {
  if (!isPublicSubmitRequest(request)) return null;

  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const declared = Number(contentLength);
    if (Number.isFinite(declared) && declared > PUBLIC_SUBMIT_MAX_BODY_BYTES) {
      return gatewayValidationResponse();
    }
  }

  if (request.body === null) return null;

  let clone: Request;
  try {
    clone = request.clone();
  } catch {
    return gatewayValidationResponse();
  }

  if (clone.body === null) return null;
  const reader = clone.body.getReader();
  let total = 0;

  try {
    while (true) {
      const next = await reader.read();
      if (next.done) return null;
      total += next.value.byteLength;
      if (total > PUBLIC_SUBMIT_MAX_BODY_BYTES) {
        await reader.cancel();
        return gatewayValidationResponse();
      }
    }
  } catch {
    return gatewayValidationResponse();
  } finally {
    reader.releaseLock();
  }
}

function executionContext(value: unknown): WorkerExecutionContext | null {
  if (value === null || typeof value !== "object") return null;
  const candidate = value as { waitUntil?: unknown };
  return typeof candidate.waitUntil === "function" ? (candidate as WorkerExecutionContext) : null;
}

function scheduleImmediateTelegramDelivery(
  trackingCode: string | null,
  env: unknown,
  ctx: unknown,
): void {
  if (trackingCode === null) return;
  const execution = executionContext(ctx);
  if (execution === null) return;

  execution.waitUntil(
    processTelegramByTrackingCode(env, trackingCode).catch(() => {
      console.error("Telegram delivery attempt failed");
    }),
  );
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const bodyLimitResponse = await enforcePublicSubmitBodyLimit(request);
      if (bodyLimitResponse !== null) return bodyLimitResponse;

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      const normalized = await normalizeCatastrophicSsrResponse(response);
      const consumed = consumeTelegramDeliverySignal(normalized);
      scheduleImmediateTelegramDelivery(consumed.trackingCode, env, ctx);
      return consumed.response;
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },

  async scheduled(controller: WorkerScheduledController, env: unknown, ctx: unknown) {
    if (controller.cron !== TELEGRAM_RECOVERY_CRON) return;
    void controller.scheduledTime;
    void ctx;
    await processTelegramRecoveryBatch(env);
  },
};
