import { createFileRoute } from "@tanstack/react-router";

import { PortfolioPage } from "@/components/portfolio/portfolio-page";
import { PortfolioError, PortfolioLoading } from "@/components/portfolio/portfolio-states";
import { getPortfolioItems } from "@/lib/content/adapters";
import { buildPortfolioModel } from "@/lib/portfolio";

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
  loader: async () => buildPortfolioModel(await getPortfolioItems()),
  pendingComponent: PortfolioLoading,
  errorComponent: PortfolioError,
  component: PortfolioRoute,
});

function PortfolioRoute() {
  const cards = Route.useLoaderData();
  return <PortfolioPage cards={cards} />;
}
