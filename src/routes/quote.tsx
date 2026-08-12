import { createFileRoute } from "@tanstack/react-router";

import { quoteRouteOptions } from "@/lib/route-defs/pages";

export const Route = createFileRoute("/quote")(quoteRouteOptions("fa"));
