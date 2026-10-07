import { GuideDetailPage } from "@/components/guides/guides";
import { useRouteData } from "../shared";
import type { GuideDetailModel } from "@/lib/guides";

export function GuideDetailRoute() {
  const guide = useRouteData<GuideDetailModel | undefined>();
  if (!guide) return null;
  return <GuideDetailPage guide={guide} />;
}
