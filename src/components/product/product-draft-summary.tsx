import {
  CURRENCY_NOTE,
  PRICE_DATE_LABEL,
  formatPriceDate,
  formatPriceLabel,
  priceTypeLabel,
} from "@/lib/product-detail";
import type { GraveStoneRequestDraft } from "@/lib/request-draft";
import { useLocale, useT } from "@/lib/i18n/react";

export const DRAFT_HEADING = "خلاصه انتخاب";
export const DRAFT_LOGISTICS_NOTE = "هزینهٔ حمل و نصب جداگانه و پس از بررسی محل اعلام می‌شود.";

/** Renders derived snapshot data only. No PII, no tracking code, no submission. */
export function ProductDraftSummary({ draft }: { draft: GraveStoneRequestDraft }) {
  const t = useT();
  const locale = useLocale();
  const snapshot = draft.displaySnapshot;
  const date = formatPriceDate(snapshot.priceUpdatedAt, locale);

  return (
    <section
      role="status"
      aria-live="polite"
      className="flex flex-col gap-3 border border-border-subtle bg-surface p-4"
    >
      <h2 className="text-base font-bold text-text-primary">{t(DRAFT_HEADING)}</h2>

      <dl className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <dt className="text-sm text-text-caption">{t("محصول")}</dt>
          <dd className="text-sm text-text-primary">{snapshot.productTitle}</dd>
        </div>
        <div className="flex flex-wrap gap-2">
          <dt className="text-sm text-text-caption">{t("نوع")}</dt>
          <dd className="text-sm text-text-primary">{t(snapshot.productTypeLabel)}</dd>
        </div>
        <div className="flex flex-wrap gap-2">
          <dt className="text-sm text-text-caption">{t("سنگ")}</dt>
          <dd className="text-sm text-text-primary">
            <bdi dir="ltr">{snapshot.stoneCode}</bdi>
          </dd>
        </div>
        <div className="flex flex-wrap gap-2">
          <dt className="text-sm text-text-caption">{t("اندازه")}</dt>
          <dd className="text-sm text-text-primary">{t(snapshot.sizeLabel)}</dd>
        </div>
        <div className="flex flex-wrap gap-2">
          <dt className="text-sm text-text-caption">{t("وضعیت قیمت")}</dt>
          <dd className="text-sm text-text-primary">
            {priceTypeLabel(snapshot.priceType, locale)} —{" "}
            {formatPriceLabel(
              { priceType: snapshot.priceType, amountToman: snapshot.amountToman },
              locale,
            )}
          </dd>
        </div>
        {date ? (
          <div className="flex flex-wrap gap-2">
            <dt className="text-sm text-text-caption">{t(PRICE_DATE_LABEL)}</dt>
            <dd className="text-sm text-text-primary">{date}</dd>
          </div>
        ) : null}
      </dl>

      {snapshot.optionTitles.length > 0 ? (
        <div>
          <h3 className="text-sm font-bold text-text-primary">{t("گزینه‌های انتخاب‌شده")}</h3>
          <ul className="list-inside list-disc pt-1">
            {snapshot.optionTitles.map((title) => (
              <li key={title} className="text-sm text-text-secondary">
                {t(title)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-sm text-text-caption">{t(CURRENCY_NOTE)}</p>
      <p className="text-sm text-text-secondary">{t(DRAFT_LOGISTICS_NOTE)}</p>
    </section>
  );
}
