import { createFileRoute } from "@tanstack/react-router";

import { PortfolioPage } from "@/components/portfolio/portfolio-page";
import { PortfolioError, PortfolioLoading } from "@/components/portfolio/portfolio-states";
import { canonicalHref } from "@/lib/canonical";
import { getPortfolioItems } from "@/lib/content/adapters";
import { buildPortfolioModel } from "@/lib/portfolio";

export const Route = createFileRoute("/portfolio")({
  head: () => ({
    meta: [
      { title: "نمونه‌کارها" },
      { name: "description", content: "نمونه‌کارهای اجراشدهٔ سنگ مزار" },
      { property: "og:title", content: "نمونه‌کارها" },
      { property: "og:description", content: "نمونه‌کارهای اجراشدهٔ سنگ مزار" },
    ],
    links: [{ rel: "canonical", href: canonicalHref("/portfolio") }],
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
