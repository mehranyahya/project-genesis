import { ProductDetailPage } from "@/components/product/product-detail-page";
import { useRouteData } from "../shared";
import type { ProductDetailData } from "../pages";

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
