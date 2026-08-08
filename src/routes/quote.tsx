import { createFileRoute } from "@tanstack/react-router";

import { QuotePage } from "@/components/request-form/quote-page";
import { canonicalHref } from "@/lib/canonical";
import { getPortfolioItems, getSite } from "@/lib/content/adapters";
import { findPortfolioReference, normalizePortfolioReference } from "@/lib/portfolio-reference";
import { getRequestTermsDocument } from "@/lib/request-terms";

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
    const [portfolioItems, site, termsDocument] = await Promise.all([
      getPortfolioItems(),
      getSite(),
      getRequestTermsDocument(),
    ]);
    return {
      portfolioReferenceId: findPortfolioReference(portfolioItems, deps.reference),
      site: site ?? null,
      termsDocument,
    };
  },
  head: () => ({
    meta: [
      { title: "ثبت سفارش — مهرآرا" },
      { name: "description", content: "ثبت درخواست بررسی سفارش در مهرآرا" },
      { property: "og:title", content: "ثبت سفارش — مهرآرا" },
      { property: "og:description", content: "ثبت درخواست بررسی سفارش در مهرآرا" },
    ],
    links: [{ rel: "canonical", href: canonicalHref("/quote") }],
  }),
  component: QuoteRoute,
});

function QuoteRoute() {
  const { portfolioReferenceId, site, termsDocument } = Route.useLoaderData();
  return (
    <QuotePage
      portfolioReferenceId={portfolioReferenceId}
      site={site}
      termsDocument={termsDocument}
    />
  );
}
