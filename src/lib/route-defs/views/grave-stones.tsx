import { GraveStoneListPage } from "@/components/grave-stones/grave-stone-list-page";
import type { buildGraveStoneListModel } from "@/lib/grave-stone-list";
import { useRouteData } from "../shared";

export function GraveStoneListRoute() {
  const model = useRouteData<ReturnType<typeof buildGraveStoneListModel>>();
  return <GraveStoneListPage model={model} />;
}
