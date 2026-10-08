import { HomePage } from "@/components/home/home-page";
import type { buildHomeViewModel } from "@/lib/home";
import { useRouteData } from "../shared";

export function HomeRoute() {
  const model = useRouteData<ReturnType<typeof buildHomeViewModel>>();
  return <HomePage model={model} />;
}
