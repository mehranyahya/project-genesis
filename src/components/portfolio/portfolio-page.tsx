import { PortfolioCard } from "./portfolio-card";
import { PortfolioEmpty } from "./portfolio-states";
import type { PortfolioCard as PortfolioCardModel } from "@/lib/portfolio";
import { useT } from "@/lib/i18n/react";

export const PORTFOLIO_HEADING = "نمونه‌کارها";
export const PORTFOLIO_INTRO =
  "نمونه‌کارهای عمومی را بررسی کنید و برای استعلام اجرای مشابه، مرجع عمومی همان نمونه را همراه درخواست بفرستید.";

export function PortfolioPage({ cards }: { cards: readonly PortfolioCardModel[] }) {
  const t = useT();
  return (
    <section className="mx-auto grid w-full max-w-[80rem] grid-cols-4 gap-x-4 gap-y-6 px-4 py-10 md:grid-cols-8 lg:grid-cols-12">
      <div className="col-span-4 md:col-span-8 lg:col-span-12">
        <h1 className="text-2xl font-bold text-text-primary">{t(PORTFOLIO_HEADING)}</h1>
        <p className="pt-3 text-sm text-text-secondary">{t(PORTFOLIO_INTRO)}</p>
      </div>

      {cards.length === 0 ? (
        <PortfolioEmpty />
      ) : (
        <ul className="col-span-4 grid grid-cols-4 gap-4 md:col-span-8 md:grid-cols-8 lg:col-span-12 lg:grid-cols-12">
          {cards.map((card) => (
            <PortfolioCard key={card.publicReferenceId} card={card} />
          ))}
        </ul>
      )}
    </section>
  );
}
