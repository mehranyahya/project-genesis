import {
  CURRENCY_NOTE,
  PRICE_DATE_LABEL,
  formatPriceDate,
  formatPriceLabel,
  priceTypeLabel,
} from "@/lib/product-detail";
import type { ProductDetailVariant, SelectionPrice } from "@/lib/product-detail";
import { useLocale, useT } from "@/lib/i18n/react";

export const PRICE_HEADING = "وضعیت قیمت";
export const INCLUDES_HEADING = "شامل";
export const EXCLUDES_HEADING = "شامل نمی‌شود";

export function ProductPricePanel({
  variant,
  price,
}: {
  variant: ProductDetailVariant;
  price: SelectionPrice;
}) {
  const t = useT();
  const locale = useLocale();
  const date =
    price.priceType === "review" ? null : formatPriceDate(variant.priceUpdatedAt, locale);

  return (
    <section className="flex flex-col gap-3 border border-border-subtle bg-surface p-4">
      <h2 className="text-base font-bold text-text-primary">{t(PRICE_HEADING)}</h2>

      <p className="text-sm text-text-secondary">{priceTypeLabel(price.priceType, locale)}</p>
      <p className="text-base font-bold text-text-primary">{formatPriceLabel(price, locale)}</p>
      <p className="text-sm text-text-caption">{t(CURRENCY_NOTE)}</p>

      {date ? (
        <p className="text-sm text-text-secondary">
          {t(PRICE_DATE_LABEL)} {date}
        </p>
      ) : null}

      {variant.includes.length > 0 ? (
        <div>
          <h3 className="text-sm font-bold text-text-primary">{t(INCLUDES_HEADING)}</h3>
          <ul className="list-inside list-disc pt-1">
            {variant.includes.map((item) => (
              <li key={item} className="text-sm text-text-secondary">
                {item}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {variant.excludes.length > 0 ? (
        <div>
          <h3 className="text-sm font-bold text-text-primary">{t(EXCLUDES_HEADING)}</h3>
          <ul className="list-inside list-disc pt-1">
            {variant.excludes.map((item) => (
              <li key={item} className="text-sm text-text-secondary">
                {item}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
