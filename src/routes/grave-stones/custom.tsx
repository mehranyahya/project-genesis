import { createFileRoute } from "@tanstack/react-router";

import { CustomFunnelPage } from "@/components/custom-funnel/custom-funnel-page";
import {
  CustomFunnelError,
  CustomFunnelLoading,
} from "@/components/custom-funnel/custom-funnel-states";
import { getCatalogVersion, getProducts } from "@/lib/content/adapters";

export const Route = createFileRoute("/grave-stones/custom")({
  loader: async () => {
    const [products, catalogVersion] = await Promise.all([
      getProducts({ type: "simple" }),
      getCatalogVersion(),
    ]);
    return { products, catalogVersion: catalogVersion ?? null };
  },
  head: () => ({
    meta: [
      { title: "سفارش سفارشی سنگ مزار — مهرآرا" },
      { name: "description", content: "مسیر سفارش سفارشی سنگ مزار مهرآرا" },
      { property: "og:title", content: "سفارش سفارشی سنگ مزار — مهرآرا" },
      { property: "og:description", content: "مسیر سفارش سفارشی سنگ مزار مهرآرا" },
    ],
    links: [{ rel: "canonical", href: "/grave-stones/custom" }],
  }),
  pendingComponent: CustomFunnelLoading,
  errorComponent: CustomFunnelError,
  component: CustomGraveStoneRoute,
});

function CustomGraveStoneRoute() {
  const { products, catalogVersion } = Route.useLoaderData();
  return <CustomFunnelPage products={products} catalogVersion={catalogVersion} />;
}
