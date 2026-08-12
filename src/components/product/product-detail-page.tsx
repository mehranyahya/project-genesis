import { useMemo, useState } from "react";

import { ProductDraftSummary } from "./product-draft-summary";
import { ProductMediaStage } from "./product-media-stage";
import { ProductPricePanel } from "./product-price-panel";
import { ProductSelection } from "./product-selection";
import { ProductShare } from "./product-share";
import { RequestForm } from "@/components/request-form/request-form";
import type { Site } from "@/lib/content/types";
import { isCatalogVersion } from "@/lib/content/types";
import type { ProductDetailModel } from "@/lib/product-detail";
import { resolveSelectionPrice } from "@/lib/product-detail";
import type { GraveStoneRequestDraft } from "@/lib/request-draft";
import { buildGraveStoneRequestDraft } from "@/lib/request-draft";
import type { RequestTermsDocument } from "@/lib/request-form";
import { useT } from "@/lib/i18n/react";

export const REVIEW_BUTTON_LABEL = "بازبینی انتخاب";
export const DRAFT_BLOCKED_TEXT = "امکان آماده‌سازی خلاصه سفارش در حال حاضر وجود ندارد.";

const ACTION =
  "inline-flex min-h-11 items-center justify-center border border-action-primary bg-action-primary px-5 py-2 text-sm font-bold text-text-inverse transition-colors duration-[180ms] enabled:hover:border-surface-inverse enabled:hover:bg-surface-inverse disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none";

export function ProductDetailPage({
  model,
  catalogVersion,
  site,
  termsDocument,
}: {
  model: ProductDetailModel;
  catalogVersion: string | null;
  site?: Site | null;
  termsDocument: RequestTermsDocument | null;
}) {
  const t = useT();
  const [variantId, setVariantId] = useState(model.variants[0]!.id);
  const [optionIds, setOptionIds] = useState<readonly string[]>([]);
  const [draft, setDraft] = useState<GraveStoneRequestDraft | null>(null);

  const variant = useMemo(
    () => model.variants.find((item) => item.id === variantId) ?? model.variants[0]!,
    [model.variants, variantId],
  );

  const selectedOptions = variant.options.filter((option) => optionIds.includes(option.id));
  const price = resolveSelectionPrice(variant, selectedOptions);

  const canReview = typeof catalogVersion === "string" && isCatalogVersion(catalogVersion);

  const selectVariant = (nextId: string) => {
    setVariantId(nextId);
    setOptionIds([]);
    setDraft(null);
  };

  const toggleOption = (optionId: string) => {
    setOptionIds((current) =>
      current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId],
    );
    setDraft(null);
  };

  const reviewSelection = () => {
    setDraft(
      buildGraveStoneRequestDraft({
        model,
        catalogVersion,
        variantId: variant.id,
        optionIds: selectedOptions.map((option) => option.id),
      }),
    );
  };

  return (
    <section className="mx-auto grid w-full max-w-[80rem] grid-cols-4 gap-x-4 gap-y-6 px-4 py-10 md:grid-cols-8 lg:grid-cols-12">
      <div className="col-span-4 md:col-span-8 lg:col-span-12">
        <h1 className="text-2xl font-bold text-text-primary">{model.title}</h1>
        <p className="pt-2 text-sm text-text-secondary">{t(model.typeLabel)}</p>
        <p className="pt-1 text-sm text-text-caption">
          {t("کد محصول:")}
          <bdi dir="ltr">{model.code}</bdi>
        </p>
      </div>

      <div className="col-span-4 md:col-span-8 lg:col-span-7">
        <ProductMediaStage media={model.media} />
      </div>

      <div className="col-span-4 flex flex-col gap-6 md:col-span-8 lg:col-span-5">
        {model.summary ? <p className="text-sm text-text-primary">{model.summary}</p> : null}
        {model.description ? (
          <p className="text-sm text-text-secondary">{model.description}</p>
        ) : null}

        <ProductSelection
          variants={model.variants}
          selectedVariant={variant}
          selectedOptionIds={optionIds}
          onSelectVariant={selectVariant}
          onToggleOption={toggleOption}
        />

        <ProductPricePanel variant={variant} price={price} />

        <div className="flex flex-col gap-3">
          <button type="button" className={ACTION} disabled={!canReview} onClick={reviewSelection}>
            {t(REVIEW_BUTTON_LABEL)}
          </button>
          {!canReview ? (
            <p className="text-sm text-text-secondary">{t(DRAFT_BLOCKED_TEXT)}</p>
          ) : null}
        </div>

        <ProductShare slug={model.slug} title={model.title} code={model.code} />

        {draft ? (
          <>
            <ProductDraftSummary draft={draft} />
            <RequestForm
              source={{ kind: "grave_stone", draft }}
              site={site ?? null}
              termsDocument={termsDocument}
            />
          </>
        ) : null}
      </div>
    </section>
  );
}
