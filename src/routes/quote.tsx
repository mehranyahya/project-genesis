import { createFileRoute } from "@tanstack/react-router";

import { QuotePage } from "@/components/request-form/quote-page";
import { getPortfolioItems, getSite } from "@/lib/content/adapters";
import { findPortfolioReference, normalizePortfolioReference } from "@/lib/portfolio-reference";

interface QuoteSearch {
  readonly source?: "portfolio";
  readonly reference?: string;
}

export const Route = createFileRoute("/quote")({
  validateSearch: (search: Record<string, unknown>): QuoteSearch => {
    const reference = normalizePortfolioReference(search["reference"]);
    if (search["source"] !== "portfolio" || reference === null) return {};
    return { source: "portfolio", reference };
  },
  loaderDeps: ({ search }) => ({ reference: search.reference ?? null }),
  loader: async ({ deps }) => {
    const [portfolioItems, site] = await Promise.all([getPortfolioItems(), getSite()]);
    return {
      portfolioReferenceId: findPortfolioReference(portfolioItems, deps.reference),
      site: site ?? null,
    };
  },
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
  const { portfolioReferenceId, site } = Route.useLoaderData();
  return <QuotePage portfolioReferenceId={portfolioReferenceId} site={site} />;
}
