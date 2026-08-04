import { createFileRoute } from "@tanstack/react-router";

import { RouteSkeleton } from "@/components/layout/route-skeleton";

export const Route = createFileRoute("/grave-stones/")({
  head: () => ({
    meta: [
      { title: "سنگ مزار — مهرآرا" },
      { name: "description", content: "فهرست سنگ مزار مهرآرا" },
      { property: "og:title", content: "سنگ مزار — مهرآرا" },
      { property: "og:description", content: "فهرست سنگ مزار مهرآرا" },
    ],
    links: [{ rel: "canonical", href: "/grave-stones" }],
  }),
  component: GraveStonesRoute,
});

function GraveStonesRoute() {
  return <RouteSkeleton title="سنگ مزار" />;
}
