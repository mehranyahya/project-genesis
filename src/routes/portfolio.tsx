import { createFileRoute } from "@tanstack/react-router";

import { RouteSkeleton } from "@/components/layout/route-skeleton";

export const Route = createFileRoute("/portfolio")({
  head: () => ({
    meta: [
      { title: "نمونه‌کارها — مهرآرا" },
      { name: "description", content: "نمونه‌کارهای اجراشدهٔ مهرآرا" },
      { property: "og:title", content: "نمونه‌کارها — مهرآرا" },
      { property: "og:description", content: "نمونه‌کارهای اجراشدهٔ مهرآرا" },
    ],
    links: [{ rel: "canonical", href: "/portfolio" }],
  }),
  component: PortfolioRoute,
});

function PortfolioRoute() {
  return <RouteSkeleton title="نمونه‌کارها" />;
}
