import { GraveStoneListPage } from "@/components/grave-stones/grave-stone-list-page";
import { useRouteData } from "../shared";
import type { buildGraveStoneListModel } from "@/lib/grave-stone-list";

export function GraveStoneListRoute() {
  const model = useRouteData<ReturnType<typeof buildGraveStoneListModel>>();
  return <GraveStoneListPage model={model} />;
}
