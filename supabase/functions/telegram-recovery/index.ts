import { verifyRecoveryCronRequest } from "../_shared/cron-auth.ts";
import { readSupabaseServerConfig } from "../_shared/supabase-rest.ts";
import { processTelegramRecoveryBatch } from "../_shared/telegram-delivery.ts";

function jsonResponse(body: unknown, status: number): Response {
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

Deno.serve(async (request: Request) => {
  try {
    const supabase = readSupabaseServerConfig();
    const auth = await verifyRecoveryCronRequest(request, supabase);
    if (auth.kind === "configuration_error") {
      return jsonResponse({ code: "TEMPORARILY_UNAVAILABLE" }, 503);
    }
    if (auth.kind !== "ok") return jsonResponse({ code: "AUTH_INVALID" }, 401);

    const result = await processTelegramRecoveryBatch(supabase);
    if (result.failedToComplete > 0) {
      return jsonResponse({ code: "TEMPORARILY_UNAVAILABLE" }, 503);
    }
    return jsonResponse(
      { code: "RECOVERY_COMPLETED", claimed: result.claimed, completed: result.completed },
      200,
    );
  } catch {
    return jsonResponse({ code: "TEMPORARILY_UNAVAILABLE" }, 503);
  }
});
