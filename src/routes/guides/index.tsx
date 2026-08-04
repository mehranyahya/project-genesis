import { createFileRoute } from "@tanstack/react-router";

import { RouteSkeleton } from "@/components/layout/route-skeleton";

export const Route = createFileRoute("/guides/")({
  head: () => ({
    meta: [
      { title: "راهنماها — مهرآرا" },
      { name: "description", content: "راهنماهای انتخاب و سفارش سنگ در مهرآرا" },
      { property: "og:title", content: "راهنماها — مهرآرا" },
      { property: "og:description", content: "راهنماهای انتخاب و سفارش سنگ در مهرآرا" },
    ],
    links: [{ rel: "canonical", href: "/guides" }],
  }),
  component: GuidesRoute,
});

function GuidesRoute() {
  return <RouteSkeleton title="راهنماها" />;
}
