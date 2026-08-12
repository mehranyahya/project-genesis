import { createFileRoute } from "@tanstack/react-router";

import { guideDetailRouteOptions } from "@/lib/route-defs/pages";

export const Route = createFileRoute("/guides/$slug")(guideDetailRouteOptions("fa"));
