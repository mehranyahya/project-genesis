import { GuidesListPage } from "@/components/guides/guides";
import { useRouteData } from "../shared";
import type { GuideListItem } from "@/lib/guides";

export function GuideListRoute() {
  const items = useRouteData<GuideListItem[]>();
  return <GuidesListPage items={items} />;
}
