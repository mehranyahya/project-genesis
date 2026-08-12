import { createFileRoute } from "@tanstack/react-router";

import { productDetailRouteOptions } from "@/lib/route-defs/pages";

export const Route = createFileRoute("/grave-stones/$slug")(productDetailRouteOptions("fa"));
