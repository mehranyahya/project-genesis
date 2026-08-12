import { createFileRoute } from "@tanstack/react-router";

import { guideListRouteOptions } from "@/lib/route-defs/pages";

export const Route = createFileRoute("/en/guides/")(guideListRouteOptions("en"));
