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

  if (verification.kind === "invalid") {
    return jsonResponse({ code: "BOT_VERIFICATION_INVALID" }, 422);
  }

  const securityContext =
    verification.kind === "verified"
      ? { botVerification: "verified" as const, riskFlags: [] as const }
      : verification.kind === "no_token"
        ? {
            botVerification: "unverified_no_token" as const,
            riskFlags: ["turnstile_no_token"] as const,
          }
        : {
            botVerification: "unverified_service_error" as const,
            riskFlags: ["turnstile_unavailable"] as const,
          };

  const response = await dependencies.submitRequest(request, undefined, securityContext);
  return attachTelegramDeliverySignal(response);
}
