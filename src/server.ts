import "./lib/error-capture";

import { isIP } from "node:net";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { handleSitemapRequest } from "./lib/sitemap.server";
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

type WorkerRateLimitBinding = {
  limit: (input: { readonly key: string }) => Promise<{ readonly success: boolean }>;
};

export const TELEGRAM_RECOVERY_CRON = "0 * * * *";
export const PUBLIC_SUBMIT_MAX_BODY_BYTES = 16 * 1024;
export const SUBMIT_FLOOD_LIMIT_BINDING = "SUBMIT_FLOOD_LIMITER";
export const PREVIEW_ROBOTS_HEADER = "noindex, nofollow, noarchive";

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

function gatewayJsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "cache-control": "no-store, max-age=0",
      "content-type": "application/json; charset=utf-8",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  });
}

function gatewayValidationResponse(): Response {
  return gatewayJsonResponse({ code: "VALIDATION_ERROR", field_errors: {} }, 422);
}

function gatewayRateLimitedResponse(): Response {
  return gatewayJsonResponse({ code: "RATE_LIMITED" }, 429);
}

function isPublicSubmitRequest(request: Request): boolean {
  if (request.method !== "POST") return false;
  try {
    return new URL(request.url).pathname === PUBLIC_SUBMIT_PATH;
  } catch {
    return false;
  }
}

function publicIndexingEnabled(env: unknown): boolean {
  if (env === null || typeof env !== "object") return false;
  return (env as Record<string, unknown>)["PUBLIC_INDEXING"] === "true";
}

export function applyDeploymentIndexingHeaders(response: Response, env: unknown): Response {
  if (publicIndexingEnabled(env)) return response;

  const headers = new Headers(response.headers);
  headers.set("x-robots-tag", PREVIEW_ROBOTS_HEADER);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function floodLimiterFromEnv(env: unknown): WorkerRateLimitBinding | null {
  if (env === null || typeof env !== "object") return null;
  const value = (env as Record<string, unknown>)[SUBMIT_FLOOD_LIMIT_BINDING];
  if (value === null || typeof value !== "object") return null;
  const candidate = value as { limit?: unknown };
  return typeof candidate.limit === "function" ? (value as WorkerRateLimitBinding) : null;
}

export async function enforcePublicSubmitFloodLimit(
  request: Request,
  env: unknown,
): Promise<Response | null> {
  if (!isPublicSubmitRequest(request)) return null;

  const ip = request.headers.get("cf-connecting-ip")?.trim() ?? "";
  if (isIP(ip) === 0) return null;

  const limiter = floodLimiterFromEnv(env);
  if (limiter === null) return null;

  try {
    const result = await limiter.limit({ key: ip });
    return result.success ? null : gatewayRateLimitedResponse();
  } catch {
    // This is an emergency, eventually-consistent flood layer only. The exact
    // transactional phone/IP rules in PostgreSQL remain authoritative.
    console.error("Worker submit flood limiter unavailable");
    return null;
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
      const sitemapResponse = await handleSitemapRequest(request, env);
      if (sitemapResponse !== null) {
        return applyDeploymentIndexingHeaders(sitemapResponse, env);
      }

      const floodLimitResponse = await enforcePublicSubmitFloodLimit(request, env);
      if (floodLimitResponse !== null) {
        return applyDeploymentIndexingHeaders(floodLimitResponse, env);
      }

      const bodyLimitResponse = await enforcePublicSubmitBodyLimit(request);
      if (bodyLimitResponse !== null) {
        return applyDeploymentIndexingHeaders(bodyLimitResponse, env);
      }

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      const normalized = await normalizeCatastrophicSsrResponse(response);
      const consumed = consumeTelegramDeliverySignal(normalized);
      scheduleImmediateTelegramDelivery(consumed.trackingCode, env, ctx);
      return applyDeploymentIndexingHeaders(consumed.response, env);
    } catch (error) {
      console.error(error);
      return applyDeploymentIndexingHeaders(
        new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
        env,
      );
    }
  },

  async scheduled(controller: WorkerScheduledController, env: unknown, ctx: unknown) {
    if (controller.cron !== TELEGRAM_RECOVERY_CRON) return;
    void controller.scheduledTime;
    void ctx;
    await processTelegramRecoveryBatch(env);
  },
};
