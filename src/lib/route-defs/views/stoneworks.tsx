import { StoneworksPage } from "@/components/stoneworks/stoneworks-page";
import type { StoneworksPageModel } from "@/lib/service-pages";
import { useRouteData } from "../shared";

export function StoneworksRoute() {
  const page = useRouteData<StoneworksPageModel | null>();
  return <StoneworksPage page={page} />;
}
