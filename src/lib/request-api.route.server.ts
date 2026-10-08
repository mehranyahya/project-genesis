import { inspectRequestIdempotencyBeforeTurnstile } from "./request-idempotency-preflight.server";
import { handleSubmitRequest, jsonResponse } from "./request-api.server";
import { attachTelegramDeliverySignal } from "./telegram-delivery.signal";
import { verifyTurnstileRequest } from "./turnstile.server";

export interface ProtectedSubmitDependencies {
  readonly inspectIdempotency: typeof inspectRequestIdempotencyBeforeTurnstile;
  readonly verifyTurnstile: typeof verifyTurnstileRequest;
  readonly submitRequest: typeof handleSubmitRequest;
}

const defaultDependencies: ProtectedSubmitDependencies = {
  inspectIdempotency: inspectRequestIdempotencyBeforeTurnstile,
  verifyTurnstile: verifyTurnstileRequest,
  submitRequest: handleSubmitRequest,
};

export async function handleProtectedSubmitRequest(
  request: Request,
  dependencies: ProtectedSubmitDependencies = defaultDependencies,
): Promise<Response> {
  const preflight = await dependencies.inspectIdempotency(request);
  if (preflight.kind === "resolved") return preflight.response;

  const verification = await dependencies.verifyTurnstile(request);

  if (verification.kind === "invalid" || verification.kind === "no_token") {
    return jsonResponse({ code: "BOT_VERIFICATION_INVALID" }, 422);
  }

  if (verification.kind === "service_error") {
    return jsonResponse({ code: "TEMPORARILY_UNAVAILABLE" }, 503);
  }
  const securityContext = { botVerification: "verified" as const, riskFlags: [] as const };

  const response = await dependencies.submitRequest(request, undefined, securityContext);
  return attachTelegramDeliverySignal(response);
}
