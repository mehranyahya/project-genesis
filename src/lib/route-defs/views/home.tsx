import { HomePage } from "@/components/home/home-page";
import { useRouteData } from "../shared";
import type { buildHomeViewModel } from "@/lib/home";

export function HomeRoute() {
  const model = useRouteData<ReturnType<typeof buildHomeViewModel>>();
  return <HomePage model={model} />;
}
