import { verifyRecoveryCronRequest } from "../_shared/cron-auth.ts";
import { readSupabaseServerConfig } from "../_shared/supabase-rest.ts";
import { processTelegramRecoveryBatch } from "../_shared/telegram-delivery.ts";
import { processSmsRecoveryBatch } from "../_shared/sms-delivery.ts";

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

    // Keep the existing signed, replay-protected hourly entry point. Each
    // channel runs even if the other fails; SMS has its own durable queue.
    const [telegram, sms] = await Promise.allSettled([
      processTelegramRecoveryBatch(supabase),
      processSmsRecoveryBatch(supabase),
    ]);
    if (
      telegram.status === "rejected" ||
      sms.status === "rejected" ||
      telegram.value.failedToComplete > 0 ||
      sms.value.completionFailures > 0 ||
      sms.value.state === "unconfigured"
    ) {
      return jsonResponse({ code: "TEMPORARILY_UNAVAILABLE" }, 503);
    }
    const result = telegram.value;
    return jsonResponse(
      {
        code: "RECOVERY_COMPLETED",
        claimed: result.claimed,
        completed: result.completed,
        sms: sms.value,
      },
      200,
    );
  } catch {
    return jsonResponse({ code: "TEMPORARILY_UNAVAILABLE" }, 503);
  }
});
