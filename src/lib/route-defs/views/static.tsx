import { StaticPageView, ContentBlockedState } from "@/components/static-pages/static-pages";
import type { StaticPageModel } from "@/lib/static-pages";
import { useRouteData } from "../shared";

export function StaticPageRoute() {
  const page = useRouteData<StaticPageModel | null>() ?? null;
  return page ? <StaticPageView page={page} /> : <ContentBlockedState />;
}
