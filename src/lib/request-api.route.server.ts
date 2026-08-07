import { handleSubmitRequest, jsonResponse } from "./request-api.server";
import { attachTelegramDeliverySignal } from "./telegram-delivery.signal";
import { verifyTurnstileRequest } from "./turnstile.server";

export async function handleProtectedSubmitRequest(request: Request): Promise<Response> {
  const verification = await verifyTurnstileRequest(request);

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

  const response = await handleSubmitRequest(request, undefined, securityContext);
  return attachTelegramDeliverySignal(response);
}
