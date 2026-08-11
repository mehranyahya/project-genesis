import { createFileRoute } from "@tanstack/react-router";

import { CustomFunnelPage } from "@/components/custom-funnel/custom-funnel-page";
import {
  CustomFunnelError,
  CustomFunnelLoading,
} from "@/components/custom-funnel/custom-funnel-states";
import { canonicalHref } from "@/lib/canonical";
import { getCatalogVersion, getProducts, getSite } from "@/lib/content/adapters";
import { getRequestTermsDocument } from "@/lib/request-terms";

export const Route = createFileRoute("/grave-stones/custom")({
  loader: async () => {
    const [products, catalogVersion, site, termsDocument] = await Promise.all([
      getProducts({ type: "simple" }),
      getCatalogVersion(),
      getSite(),
      getRequestTermsDocument(),
    ]);
    return {
      products,
      catalogVersion: catalogVersion ?? null,
      site: site ?? null,
      termsDocument,
    };
  },
  head: () => ({
    meta: [
      { title: "سفارش سفارشی سنگ مزار" },
      { name: "description", content: "مسیر ثبت سفارش سفارشی سنگ مزار" },
      { property: "og:title", content: "سفارش سفارشی سنگ مزار" },
      { property: "og:description", content: "مسیر ثبت سفارش سفارشی سنگ مزار" },
    ],
    links: [{ rel: "canonical", href: canonicalHref("/grave-stones/custom") }],
  }),
  pendingComponent: CustomFunnelLoading,
  errorComponent: CustomFunnelError,
  component: CustomGraveStoneRoute,
});

function CustomGraveStoneRoute() {
  const { products, catalogVersion, site, termsDocument } = Route.useLoaderData();
  return (
    <CustomFunnelPage
      products={products}
      catalogVersion={catalogVersion}
      site={site}
      termsDocument={termsDocument}
    />
  );
}
