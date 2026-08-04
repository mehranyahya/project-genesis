import { createFileRoute } from "@tanstack/react-router";

import { RouteSkeleton } from "@/components/layout/route-skeleton";

export const Route = createFileRoute("/grave-stones/custom")({
  head: () => ({
    meta: [
      { title: "سفارش سفارشی سنگ مزار — مهرآرا" },
      { name: "description", content: "مسیر سفارش سفارشی سنگ مزار مهرآرا" },
      { property: "og:title", content: "سفارش سفارشی سنگ مزار — مهرآرا" },
      { property: "og:description", content: "مسیر سفارش سفارشی سنگ مزار مهرآرا" },
    ],
    links: [{ rel: "canonical", href: "/grave-stones/custom" }],
  }),
  component: CustomGraveStoneRoute,
});

function CustomGraveStoneRoute() {
  return <RouteSkeleton title="سفارش سفارشی سنگ مزار" />;
}
