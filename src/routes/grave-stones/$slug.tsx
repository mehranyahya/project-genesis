import { createFileRoute, notFound } from "@tanstack/react-router";

import { ProductDetailPage } from "@/components/product/product-detail-page";
import {
  ProductDetailError,
  ProductDetailLoading,
} from "@/components/product/product-detail-states";
import { canonicalHref } from "@/lib/canonical";
import { getCatalogVersion, getProduct, getSite } from "@/lib/content/adapters";
import { buildProductDetailModel } from "@/lib/product-detail";
import { getRequestTermsDocument } from "@/lib/request-terms";

const GENERIC_DESCRIPTION = "جزئیات مدل سنگ مزار و ثبت درخواست بررسی سفارش.";

export const Route = createFileRoute("/grave-stones/$slug")({
  loader: async ({ params }) => {
    const [product, catalogVersion, site, termsDocument] = await Promise.all([
      getProduct(params.slug),
      getCatalogVersion(),
      getSite(),
      getRequestTermsDocument(),
    ]);

    const model = buildProductDetailModel(product, params.slug);
    if (model === null) throw notFound();

    return {
      model,
      catalogVersion: catalogVersion ?? null,
      site: site ?? null,
      termsDocument,
    };
  },
  head: ({ loaderData }) => {
    const title = loaderData ? loaderData.model.title : "جزئیات سنگ مزار";
    const description = loaderData?.model.summary ?? GENERIC_DESCRIPTION;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
      links: loaderData
        ? [
            {
              rel: "canonical",
              href: canonicalHref(`/grave-stones/${loaderData.model.slug}`),
            },
          ]
        : [],
    };
  },
  pendingComponent: ProductDetailLoading,
  errorComponent: ProductDetailError,
  component: GraveStoneDetailRoute,
});

function GraveStoneDetailRoute() {
  const { model, catalogVersion, site, termsDocument } = Route.useLoaderData();
  return (
    <ProductDetailPage
      model={model}
      catalogVersion={catalogVersion}
      site={site}
      termsDocument={termsDocument}
    />
  );
}
