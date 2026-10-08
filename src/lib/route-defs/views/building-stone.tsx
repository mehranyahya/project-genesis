import { BuildingStonePage } from "@/components/building-stone/building-stone-page";
import type { buildingStoneRouteOptions } from "../pages";
type BuildingStoneData = Awaited<
  ReturnType<ReturnType<typeof buildingStoneRouteOptions>["loader"]>
>;
import { useRouteData } from "../shared";

export function BuildingStoneRoute() {
  const { site, termsDocument } = useRouteData<BuildingStoneData>();
  return <BuildingStonePage site={site} termsDocument={termsDocument} />;
}
