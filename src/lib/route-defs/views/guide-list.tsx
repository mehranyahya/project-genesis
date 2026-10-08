import { GuidesListPage } from "@/components/guides/guides";
import type { GuideListItem } from "@/lib/guides";
import { useRouteData } from "../shared";

export function GuideListRoute() {
  const items = useRouteData<GuideListItem[]>();
  return <GuidesListPage items={items} />;
}
