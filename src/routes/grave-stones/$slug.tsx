import { createFileRoute, notFound } from "@tanstack/react-router";

import { ProductDetailPage } from "@/components/product/product-detail-page";
import {
  ProductDetailError,
  ProductDetailLoading,
} from "@/components/product/product-detail-states";
import { getCatalogVersion, getProduct } from "@/lib/content/adapters";
import { buildProductDetailModel } from "@/lib/product-detail";

const GENERIC_DESCRIPTION = "صفحهٔ جزئیات سنگ مزار مهرآرا";

export const Route = createFileRoute("/grave-stones/$slug")({
  loader: async ({ params }) => {
    const [product, catalogVersion] = await Promise.all([
      getProduct(params.slug),
      getCatalogVersion(),
    ]);

    const model = buildProductDetailModel(product, params.slug);
    if (model === null) throw notFound();

    return { model, catalogVersion: catalogVersion ?? null };
  },
  head: ({ loaderData, params }) => {
    const title = loaderData ? `${loaderData.model.title} — مهرآرا` : "جزئیات سنگ مزار — مهرآرا";
    const description = loaderData?.model.summary ?? GENERIC_DESCRIPTION;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
      links: [{ rel: "canonical", href: `/grave-stones/${params.slug}` }],
    };
  },
  pendingComponent: ProductDetailLoading,
  errorComponent: ProductDetailError,
  component: GraveStoneDetailRoute,
});

function GraveStoneDetailRoute() {
  const { model, catalogVersion } = Route.useLoaderData();
  return <ProductDetailPage model={model} catalogVersion={catalogVersion} />;
}
