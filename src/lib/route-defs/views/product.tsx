import { ProductDetailPage } from "@/components/product/product-detail-page";
import { useLocale } from "@/lib/i18n/react";
import type { ProductDetailData } from "../pages";
import { useRouteData } from "../shared";

export function ProductDetailRoute() {
  const locale = useLocale();
  const { model, catalogVersion, site, termsDocument } = useRouteData<ProductDetailData>();
  return (
    <ProductDetailPage
      key={`${locale}:${model.id}:${catalogVersion ?? "missing"}`}
      model={model}
      catalogVersion={catalogVersion}
      site={site}
      termsDocument={termsDocument}
    />
  );
}
