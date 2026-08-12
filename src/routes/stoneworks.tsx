import { createFileRoute } from "@tanstack/react-router";

import { stoneworksRouteOptions } from "@/lib/route-defs/pages";

export const Route = createFileRoute("/stoneworks")(stoneworksRouteOptions("fa"));
