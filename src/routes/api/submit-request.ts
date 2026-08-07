import { createFileRoute } from "@tanstack/react-router";

import { handleSubmitRequest } from "@/lib/request-api.server";

export const Route = createFileRoute("/api/submit-request")({
  server: {
    handlers: {
      POST: async ({ request }) => handleSubmitRequest(request),
    },
  },
});
