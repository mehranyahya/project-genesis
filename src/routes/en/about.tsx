import { createFileRoute } from "@tanstack/react-router";

import { aboutRouteOptions } from "@/lib/route-defs/pages";

export const Route = createFileRoute("/en/about")(aboutRouteOptions("en"));
