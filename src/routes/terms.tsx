import { createFileRoute } from "@tanstack/react-router";

import { termsRouteOptions } from "@/lib/route-defs/pages";

export const Route = createFileRoute("/terms")(termsRouteOptions("fa"));
