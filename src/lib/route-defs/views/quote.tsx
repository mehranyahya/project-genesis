import { QuotePage } from "@/components/request-form/quote-page";
import { useRouteData } from "../shared";
import type { QuoteData } from "../pages";

export function QuoteRoute() {
  const { portfolioReferenceId, site, termsDocument } = useRouteData<QuoteData>();
  return (
    <QuotePage
      portfolioReferenceId={portfolioReferenceId}
      site={site}
      termsDocument={termsDocument}
    />
  );
}
