import { createFileRoute } from "@tanstack/react-router";

import { portfolioRouteOptions } from "@/lib/route-defs/pages";

export const Route = createFileRoute("/portfolio")(portfolioRouteOptions("fa"));
