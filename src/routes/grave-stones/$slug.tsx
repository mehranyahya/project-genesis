import { createFileRoute } from "@tanstack/react-router";

import { RouteSkeleton } from "@/components/layout/route-skeleton";

export const Route = createFileRoute("/grave-stones/$slug")({
  head: () => ({
    meta: [
      { title: "جزئیات سنگ مزار — مهرآرا" },
      { name: "description", content: "صفحهٔ جزئیات سنگ مزار مهرآرا" },
      { property: "og:title", content: "جزئیات سنگ مزار — مهرآرا" },
      { property: "og:description", content: "صفحهٔ جزئیات سنگ مزار مهرآرا" },
    ],
  }),
  component: GraveStoneDetailRoute,
});

function GraveStoneDetailRoute() {
  return <RouteSkeleton title="جزئیات سنگ مزار" />;
}
