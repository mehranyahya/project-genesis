import { createFileRoute } from "@tanstack/react-router";

import { RouteSkeleton } from "@/components/layout/route-skeleton";

export const Route = createFileRoute("/quote")({
  head: () => ({
    meta: [
      { title: "ثبت سفارش — مهرآرا" },
      { name: "description", content: "ثبت درخواست بررسی سفارش در مهرآرا" },
      { property: "og:title", content: "ثبت سفارش — مهرآرا" },
      { property: "og:description", content: "ثبت درخواست بررسی سفارش در مهرآرا" },
    ],
    links: [{ rel: "canonical", href: "/quote" }],
  }),
  component: QuoteRoute,
});

function QuoteRoute() {
  return <RouteSkeleton title="ثبت سفارش" />;
}
