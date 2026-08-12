import { createFileRoute } from "@tanstack/react-router";

import { homeRouteOptions } from "@/lib/route-defs/pages";

export const Route = createFileRoute("/en/")(homeRouteOptions("en"));
