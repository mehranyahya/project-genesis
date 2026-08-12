import { createFileRoute } from "@tanstack/react-router";

import { buildingStoneRouteOptions } from "@/lib/route-defs/pages";

export const Route = createFileRoute("/building-stone")(buildingStoneRouteOptions("fa"));
