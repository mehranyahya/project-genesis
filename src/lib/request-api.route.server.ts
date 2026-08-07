import { handleSubmitRequest, jsonResponse } from "./request-api.server";
import { verifyTurnstileRequest } from "./turnstile.server";

export async function handleProtectedSubmitRequest(request: Request): Promise<Response> {
  const verification = await verifyTurnstileRequest(request);

  if (verification.kind === "invalid") {
    return jsonResponse({ code: "BOT_VERIFICATION_INVALID" }, 422);
  }
  if (verification.kind === "service_error") {
    return jsonResponse({ code: "TEMPORARILY_UNAVAILABLE" }, 503);
  }

  return handleSubmitRequest(request, undefined, {
    botVerification: "verified",
    riskFlags: [],
  });
}
