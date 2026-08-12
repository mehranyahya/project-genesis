import { createFileRoute } from "@tanstack/react-router";

import { customFunnelRouteOptions } from "@/lib/route-defs/pages";

export const Route = createFileRoute("/grave-stones/custom")(customFunnelRouteOptions("fa"));
