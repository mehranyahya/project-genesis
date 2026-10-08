import { QuotePage } from "@/components/request-form/quote-page";
import type { quoteRouteOptions } from "../pages";
type QuoteData = Awaited<ReturnType<ReturnType<typeof quoteRouteOptions>["loader"]>>;
import { useRouteData } from "../shared";

export function QuoteRoute() {
  const { portfolioReferenceId, stoneworkCategoryId, site, termsDocument } =
    useRouteData<QuoteData>();
  return (
    <QuotePage
      portfolioReferenceId={portfolioReferenceId}
      stoneworkCategoryId={stoneworkCategoryId}
      site={site}
      termsDocument={termsDocument}
    />
  );
}
