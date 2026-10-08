import { CustomFunnelPage } from "@/components/custom-funnel/custom-funnel-page";
import type { customFunnelRouteOptions } from "../pages";
type CustomFunnelData = Awaited<ReturnType<ReturnType<typeof customFunnelRouteOptions>["loader"]>>;
import { useRouteData } from "../shared";

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
