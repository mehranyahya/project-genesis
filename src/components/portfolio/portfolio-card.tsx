import { PublicMedia } from "@/components/media/public-media";
import type { PortfolioCard as PortfolioCardModel } from "@/lib/portfolio";
import { localizeRawPath } from "@/lib/i18n/locale";
import { useLocale, useT } from "@/lib/i18n/react";

export const PORTFOLIO_CARD_TITLE = "نمونه‌کار";
export const PORTFOLIO_CTA_LABEL = "مشابه این را می‌خواهم";
export const STONE_CODE_LABEL = "کد سنگ";
export const SIZE_LABEL = "اندازه";

export function PortfolioCard({ card }: { card: PortfolioCardModel }) {
  const t = useT();
  const locale = useLocale();
  const [pathname = "/quote", query] = card.quotePath.split("?");
  const quoteHref = localizeRawPath(pathname, locale) + (query ? `?${query}` : "");
  return (
    <li className="col-span-4 md:col-span-4 lg:col-span-4">
      <article className="flex h-full min-h-0 flex-col gap-3 border border-border-subtle bg-surface p-4">
        <div
          className={
            "overflow-hidden bg-surface-media " +
            (card.media.width > card.media.height ? "aspect-[3/2]" : "aspect-[4/5]")
          }
        >
          <PublicMedia
            media={card.media}
            fit="contain"
            sizes="(min-width: 1280px) 380px, (min-width: 1024px) 33vw, (min-width: 768px) 50vw, calc(100vw - 48px)"
            className="block h-full w-full"
          />
        </div>

        <h3 className="text-base font-bold text-text-primary">
          {t(PORTFOLIO_CARD_TITLE)} <bdi dir="ltr">{card.publicReferenceId}</bdi>
        </h3>

        {card.stoneCode !== null ? (
          <p className="text-sm text-text-secondary">
            <span className="text-text-caption">{t(STONE_CODE_LABEL)}: </span>
            <bdi dir="ltr">{card.stoneCode}</bdi>
          </p>
        ) : null}

        {card.sizeLabel !== null ? (
          <p className="text-sm text-text-secondary">
            <span className="text-text-caption">{t(SIZE_LABEL)}: </span>
            {t(card.sizeLabel)}
          </p>
        ) : null}

        {card.summary !== null ? (
          <p className="text-sm break-words text-text-secondary">{card.summary}</p>
        ) : null}

        <a
          href={quoteHref}
          className="mt-auto inline-flex min-h-12 items-center justify-center border border-action-primary bg-action-primary px-5 py-2 text-sm font-bold text-text-inverse transition-colors duration-[180ms] hover:border-action-hover hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none"
        >
          {t(PORTFOLIO_CTA_LABEL)}
        </a>
      </article>
    </li>
  );
}
