import { GuidesListPage } from "@/components/guides/guides";
import type { GuideListItem } from "@/lib/guides";
import { useRouteData } from "../shared";

export function GuideListRoute() {
  const { items } = useRouteData<{ items: GuideListItem[] }>();
  return <GuidesListPage items={items} />;
}
