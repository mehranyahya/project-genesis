import { createFileRoute } from "@tanstack/react-router";

import { RouteSkeleton } from "@/components/layout/route-skeleton";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "مهرآرا" },
      { name: "description", content: "فروشگاه سفارش‌محور سنگ مزار مهرآرا" },
      { property: "og:title", content: "مهرآرا" },
      { property: "og:description", content: "فروشگاه سفارش‌محور سنگ مزار مهرآرا" },
    ],
    links: [{ rel: "canonical", href: "/" }],
  }),
  component: HomeRoute,
});

function HomeRoute() {
  return <RouteSkeleton title="مهرآرا" />;
}
