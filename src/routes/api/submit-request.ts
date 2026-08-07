import { createFileRoute } from "@tanstack/react-router";

import { handleProtectedSubmitRequest } from "@/lib/request-api.route.server";

export const Route = createFileRoute("/api/submit-request")({
  server: {
    handlers: {
      POST: async ({ request }) => handleProtectedSubmitRequest(request),
    },
  },
});
