import { createFileRoute } from "@tanstack/react-router";

import { RouteSkeleton } from "@/components/layout/route-skeleton";

export const Route = createFileRoute("/guides/$slug")({
  head: () => ({
    meta: [
      { title: "راهنما — مهرآرا" },
      { name: "description", content: "صفحهٔ راهنمای مهرآرا" },
      { property: "og:title", content: "راهنما — مهرآرا" },
      { property: "og:description", content: "صفحهٔ راهنمای مهرآرا" },
    ],
  }),
  component: GuideDetailRoute,
});

function GuideDetailRoute() {
  return <RouteSkeleton title="راهنما" />;
}
