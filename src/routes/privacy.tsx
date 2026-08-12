import { createFileRoute } from "@tanstack/react-router";

import { privacyRouteOptions } from "@/lib/route-defs/pages";

export const Route = createFileRoute("/privacy")(privacyRouteOptions("fa"));
