import {
  CURRENCY_NOTE,
  PRICE_DATE_LABEL,
  PRICE_TYPE_LABELS,
  formatPriceDate,
  formatPriceLabel,
} from "@/lib/product-detail";
import type { ProductDetailVariant, SelectionPrice } from "@/lib/product-detail";

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
  const date = price.priceType === "review" ? null : formatPriceDate(variant.priceUpdatedAt);

  return (
    <section className="flex flex-col gap-3 border border-border-subtle bg-surface p-4">
      <h2 className="text-base font-bold text-text-primary">{PRICE_HEADING}</h2>

      <p className="text-sm text-text-secondary">{PRICE_TYPE_LABELS[price.priceType]}</p>
      <p className="text-base font-bold text-text-primary">{formatPriceLabel(price)}</p>
      <p className="text-sm text-text-caption">{CURRENCY_NOTE}</p>

      {date ? (
        <p className="text-sm text-text-secondary">
          {PRICE_DATE_LABEL} {date}
        </p>
      ) : null}

      {variant.includes.length > 0 ? (
        <div>
          <h3 className="text-sm font-bold text-text-primary">{INCLUDES_HEADING}</h3>
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
          <h3 className="text-sm font-bold text-text-primary">{EXCLUDES_HEADING}</h3>
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
