import { PortfolioPage } from "@/components/portfolio/portfolio-page";
import type { buildPortfolioModel } from "@/lib/portfolio";
import { useRouteData } from "../shared";

export function PortfolioRoute() {
  const cards = useRouteData<ReturnType<typeof buildPortfolioModel>>();
  return <PortfolioPage cards={cards} />;
}
