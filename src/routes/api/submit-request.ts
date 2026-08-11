import { createFileRoute } from "@tanstack/react-router";

function unreachableGatewayFallback(): Response {
  return new Response(JSON.stringify({ code: "TEMPORARILY_UNAVAILABLE" }), {
    status: 503,
    headers: {
      "cache-control": "no-store, max-age=0",
      "content-type": "application/json; charset=utf-8",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  });
}

/**
 * Defense-in-depth only. `src/server.ts` intercepts this pathname before the
 * TanStack route tree and forwards a signed envelope to Supabase Edge. If a
 * future server entry bypasses that gateway, fail closed rather than restoring
 * a second privileged request backend inside the Worker bundle.
 */
export const Route = createFileRoute("/api/submit-request")({
  server: {
    handlers: {
      POST: () => unreachableGatewayFallback(),
    },
  },
});
