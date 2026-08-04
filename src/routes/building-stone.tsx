import { createFileRoute } from "@tanstack/react-router";

import { RouteSkeleton } from "@/components/layout/route-skeleton";

export const Route = createFileRoute("/building-stone")({
  head: () => ({
    meta: [
      { title: "سنگ ساختمانی — مهرآرا" },
      { name: "description", content: "درخواست بررسی سنگ ساختمانی مهرآرا" },
      { property: "og:title", content: "سنگ ساختمانی — مهرآرا" },
      { property: "og:description", content: "درخواست بررسی سنگ ساختمانی مهرآرا" },
    ],
    links: [{ rel: "canonical", href: "/building-stone" }],
  }),
  component: BuildingStoneRoute,
});

function BuildingStoneRoute() {
  return <RouteSkeleton title="سنگ ساختمانی" />;
}
