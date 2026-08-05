import type { PortfolioCard as PortfolioCardModel } from "@/lib/portfolio";

export const PORTFOLIO_CARD_TITLE = "نمونه‌کار";
export const PORTFOLIO_CTA_LABEL = "مشابه این را می‌خواهم";
export const STONE_CODE_LABEL = "کد سنگ";
export const SIZE_LABEL = "اندازه";

export function PortfolioCard({ card }: { card: PortfolioCardModel }) {
  return (
    <li className="col-span-4 md:col-span-4 lg:col-span-4">
      <article className="flex h-full min-h-0 flex-col gap-3 border border-border-subtle bg-surface p-4 aspect-[4/5] [block-size:auto]">
        <h3 className="text-base font-bold text-text-primary">
          {PORTFOLIO_CARD_TITLE} <bdi dir="ltr">{card.publicReferenceId}</bdi>
        </h3>

        {card.stoneCode !== null ? (
          <p className="text-sm text-text-secondary">
            <span className="text-text-caption">{STONE_CODE_LABEL}: </span>
            <bdi dir="ltr">{card.stoneCode}</bdi>
          </p>
        ) : null}

        {card.sizeLabel !== null ? (
          <p className="text-sm text-text-secondary">
            <span className="text-text-caption">{SIZE_LABEL}: </span>
            {card.sizeLabel}
          </p>
        ) : null}

        {card.summary !== null ? (
          <p className="text-sm break-words text-text-secondary">{card.summary}</p>
        ) : null}

        <a
          href={card.quotePath}
          className="mt-auto inline-flex min-h-11 items-center justify-center border border-action-primary bg-action-primary px-5 py-2 text-sm font-bold text-text-inverse transition-colors duration-[180ms] hover:border-surface-inverse hover:bg-surface-inverse focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none"
        >
          {PORTFOLIO_CTA_LABEL}
        </a>
      </article>
    </li>
  );
}
