import { BuildingStonePage } from "@/components/building-stone/building-stone-page";
import { useRouteData } from "../shared";
import type { BuildingStoneData } from "../pages";

export function BuildingStoneRoute() {
  const { site, termsDocument } = useRouteData<BuildingStoneData>();
  return <BuildingStonePage site={site} termsDocument={termsDocument} />;
}
