import { PortfolioPage } from "@/components/portfolio/portfolio-page";
import { useRouteData } from "../shared";
import type { buildPortfolioModel } from "@/lib/portfolio";

export function PortfolioRoute() {
  const cards = useRouteData<ReturnType<typeof buildPortfolioModel>>();
  return <PortfolioPage cards={cards} />;
}
