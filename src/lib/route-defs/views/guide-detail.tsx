import { GuideDetailPage } from "@/components/guides/guides";
import type { GuideDetailModel } from "@/lib/guides";
import { useRouteData } from "../shared";

export function GuideDetailRoute() {
  const guide = useRouteData<GuideDetailModel | undefined>();
  if (!guide) return null;
  return <GuideDetailPage guide={guide} />;
}
