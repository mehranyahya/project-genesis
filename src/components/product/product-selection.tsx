import { formatOptionPriceLabel, formatPriceDate } from "@/lib/product-detail";
import type { ProductDetailVariant } from "@/lib/product-detail";
import { useLocale, useT } from "@/lib/i18n/react";

export const VARIANT_LEGEND = "انتخاب سنگ و اندازه";
export const OPTION_LEGEND = "گزینه‌های تکمیلی";

const ROW =
  "flex min-h-11 items-start gap-3 border border-border-subtle bg-surface p-3 has-[:checked]:border-action-primary has-[:checked]:border-2";
const CONTROL =
  "mt-1 h-5 w-5 shrink-0 accent-action-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

export function ProductSelection({
  variants,
  selectedVariant,
  selectedOptionIds,
  onSelectVariant,
  onToggleOption,
}: {
  variants: readonly ProductDetailVariant[];
  selectedVariant: ProductDetailVariant;
  selectedOptionIds: readonly string[];
  onSelectVariant: (variantId: string) => void;
  onToggleOption: (optionId: string) => void;
}) {
  const t = useT();
  const locale = useLocale();
  return (
    <div className="flex flex-col gap-6">
      <fieldset className="border border-border-subtle p-4">
        <legend className="px-2 text-sm font-bold text-text-primary">{t(VARIANT_LEGEND)}</legend>
        <div className="flex flex-col gap-3 pt-2">
          {variants.map((variant) => (
            <label key={variant.id} className={ROW} htmlFor={`variant-${variant.id}`}>
              <input
                type="radio"
                id={`variant-${variant.id}`}
                name="grave-stone-variant"
                className={CONTROL}
                value={variant.id}
                checked={variant.id === selectedVariant.id}
                onChange={() => onSelectVariant(variant.id)}
              />
              <span className="text-sm text-text-primary">
                <bdi dir="ltr">{variant.stoneCode}</bdi> — {t(variant.sizeLabel)}
                {variant.id === selectedVariant.id ? (
                  <span className="ps-2 text-sm text-text-secondary">{t("(انتخاب‌شده)")}</span>
                ) : null}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {selectedVariant.options.length > 0 ? (
        <fieldset className="border border-border-subtle p-4">
          <legend className="px-2 text-sm font-bold text-text-primary">{t(OPTION_LEGEND)}</legend>
          <div className="flex flex-col gap-3 pt-2">
            {selectedVariant.options.map((option) => {
              const date = formatPriceDate(option.priceUpdatedAt, locale);
              return (
                <label key={option.id} className={ROW} htmlFor={`option-${option.id}`}>
                  <input
                    type="checkbox"
                    id={`option-${option.id}`}
                    className={CONTROL}
                    value={option.id}
                    checked={selectedOptionIds.includes(option.id)}
                    onChange={() => onToggleOption(option.id)}
                  />
                  <span className="flex flex-col gap-1">
                    <span className="text-sm text-text-primary">{t(option.title)}</span>
                    <span className="text-sm text-text-secondary">
                      {formatOptionPriceLabel(option, locale)}
                    </span>
                    {date ? <span className="text-sm text-text-caption">{date}</span> : null}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}
    </div>
  );
}
