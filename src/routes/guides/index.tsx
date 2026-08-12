import { createFileRoute } from "@tanstack/react-router";

import { guideListRouteOptions } from "@/lib/route-defs/pages";

export const Route = createFileRoute("/guides/")(guideListRouteOptions("fa"));
