import { ProductDetailPage } from "@/components/product/product-detail-page";
import type { ProductDetailData } from "../pages";
import { useRouteData } from "../shared";

export function ProductDetailRoute() {
  const { model, catalogVersion, site, termsDocument } = useRouteData<ProductDetailData>();
  return (
    <ProductDetailPage
      model={model}
      catalogVersion={catalogVersion}
      site={site}
      termsDocument={termsDocument}
    />
  );
}
