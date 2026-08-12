import { createFileRoute } from "@tanstack/react-router";

import { graveStoneListRouteOptions } from "@/lib/route-defs/pages";

export const Route = createFileRoute("/en/grave-stones/")(graveStoneListRouteOptions("en"));
