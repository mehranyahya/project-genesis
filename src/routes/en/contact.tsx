import { createFileRoute } from "@tanstack/react-router";

import { contactRouteOptions } from "@/lib/route-defs/pages";

export const Route = createFileRoute("/en/contact")(contactRouteOptions("en"));
