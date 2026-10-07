import { CustomFunnelPage } from "@/components/custom-funnel/custom-funnel-page";
import { useRouteData } from "../shared";
import type { CustomFunnelData } from "../pages";

export function CustomFunnelRoute() {
  const { products, catalogVersion, site, termsDocument } = useRouteData<CustomFunnelData>();
  return (
    <CustomFunnelPage
      products={products}
      catalogVersion={catalogVersion}
      site={site}
      termsDocument={termsDocument}
    />
  );
}
