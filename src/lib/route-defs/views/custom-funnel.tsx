import { CustomFunnelPage } from "@/components/custom-funnel/custom-funnel-page";
import { useLocale } from "@/lib/i18n/react";
import type { customFunnelRouteOptions } from "../pages";
type CustomFunnelData = Awaited<ReturnType<ReturnType<typeof customFunnelRouteOptions>["loader"]>>;
import { useRouteData } from "../shared";

export function CustomFunnelRoute() {
  const locale = useLocale();
  const { products, catalogVersion, site, termsDocument } = useRouteData<CustomFunnelData>();
  return (
    <CustomFunnelPage
      key={`${locale}:${catalogVersion ?? "missing"}`}
      products={products}
      catalogVersion={catalogVersion}
      site={site}
      termsDocument={termsDocument}
    />
  );
}
