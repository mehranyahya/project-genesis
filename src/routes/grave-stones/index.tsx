import { createFileRoute } from "@tanstack/react-router";

import { graveStoneListRouteOptions } from "@/lib/route-defs/pages";

export const Route = createFileRoute("/grave-stones/")(graveStoneListRouteOptions("fa"));
