import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ProductDraftSummary } from "@/components/product/product-draft-summary";
import { DRAFT_BLOCKED_TEXT } from "@/components/product/product-detail-page";
import { isCatalogVersion } from "@/lib/content/types";
import type {
  CustomFunnelModel,
  CustomFunnelSelection,
  CustomFunnelVariantChoice,
} from "@/lib/custom-funnel";
import {
  CUSTOM_FUNNEL_LAST_STEP,
  CUSTOM_FUNNEL_STEPS,
  EMPTY_CUSTOM_FUNNEL_SELECTION,
  buildCustomFunnelDraft,
  findStoneChoice,
  findVariantChoice,
  reduceCustomFunnel,
} from "@/lib/custom-funnel";
import type { ProductDetailOption } from "@/lib/product-detail";
import {
  PRICE_TYPE_LABELS,
  formatAmount,
  formatPriceDate,
  hasValidNumericPrice,
} from "@/lib/product-detail";
import type { GraveStoneRequestDraft } from "@/lib/request-draft";
import { useT } from "@/lib/i18n/react";

export const CASCADE_RESET_TEXT = "انتخاب‌های مراحل بعدی به‌دلیل تغییر این مرحله پاک شد.";
export const NO_STAGE_OPTIONS_TEXT = "گزینه‌ای برای این مرحله ثبت نشده است.";
export const PREVIOUS_STEP_LABEL = "مرحله قبل";
export const NEXT_STEP_LABEL = "مرحله بعد";
export const DELIVER_DRAFT_LABEL = "تحویل خلاصه انتخاب";
export const HISTORY_STEP_KEY = "customFunnelStep";

const ROW =
  "flex min-h-11 items-start gap-3 border border-border-subtle bg-surface p-3 has-[:checked]:border-action-primary has-[:checked]:border-2";
const CONTROL =
  "mt-1 h-5 w-5 shrink-0 accent-action-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";
const ACTION =
  "inline-flex min-h-11 items-center justify-center border border-action-primary bg-action-primary px-5 py-2 text-sm font-bold text-text-inverse transition-colors duration-[180ms] enabled:hover:border-surface-inverse enabled:hover:bg-surface-inverse disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none";
const SECONDARY =
  "inline-flex min-h-11 items-center justify-center border border-border-strong bg-surface px-5 py-2 text-sm font-bold text-text-primary transition-colors duration-[180ms] enabled:hover:border-action-primary disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none";

function optionPriceText(option: ProductDetailOption): string {
  if (!hasValidNumericPrice(option)) return PRICE_TYPE_LABELS.review;
  const amount = `${formatAmount(option.amountToman as number)} تومان`;
  return option.priceType === "estimate"
    ? `${PRICE_TYPE_LABELS.estimate}: ${amount}`
    : `${PRICE_TYPE_LABELS.fixed}: ${amount}`;
}

function OptionStage({
  legend,
  name,
  options,
  selectedIds,
  onToggle,
}: {
  legend: string;
  name: string;
  options: readonly ProductDetailOption[];
  selectedIds: readonly string[];
  onToggle: (optionId: string) => void;
}) {
  const t = useT();
  if (options.length === 0) {
    return <p className="text-sm text-text-primary">{t(NO_STAGE_OPTIONS_TEXT)}</p>;
  }

  return (
    <fieldset className="border border-border-subtle p-4">
      <legend className="px-2 text-sm font-bold text-text-primary">{legend}</legend>
      <div className="flex flex-col gap-3 pt-2">
        {options.map((option) => {
          const date = formatPriceDate(option.priceUpdatedAt);
          return (
            <label key={option.id} className={ROW} htmlFor={`${name}-${option.id}`}>
              <input
                type="checkbox"
                id={`${name}-${option.id}`}
                className={CONTROL}
                value={option.id}
                checked={selectedIds.includes(option.id)}
                onChange={() => onToggle(option.id)}
              />
              <span className="flex flex-col gap-1">
                <span className="text-sm text-text-primary">{option.title}</span>
                <span className="text-sm text-text-secondary">{optionPriceText(option)}</span>
                {date ? <span className="text-sm text-text-caption">{date}</span> : null}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function CustomFunnelStepper({
  model,
  catalogVersion,
  onDraftReady,
  onDraftInvalidated,
}: {
  model: CustomFunnelModel;
  catalogVersion: string | null;
  onDraftReady: (draft: GraveStoneRequestDraft) => void;
  onDraftInvalidated: () => void;
}) {
  const [step, setStep] = useState(0);
  const t = useT();
  const [selection, setSelection] = useState<CustomFunnelSelection>(EMPTY_CUSTOM_FUNNEL_SELECTION);
  const [cascadeStep, setCascadeStep] = useState<number | null>(null);
  const ready = useRef(false);

  // Step index is the only value ever written to history state.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const current = window.history.state as Record<string, unknown> | null;
    window.history.replaceState(
      { ...(current ?? {}), [HISTORY_STEP_KEY]: 0 },
      "",
      window.location.href,
    );
    ready.current = true;

    const onPopState = (event: PopStateEvent) => {
      const state = event.state as Record<string, unknown> | null;
      const value = state?.[HISTORY_STEP_KEY];
      const next = typeof value === "number" ? value : 0;
      if (Number.isInteger(next) && next >= 0 && next <= CUSTOM_FUNNEL_LAST_STEP) {
        setStep(next);
      }
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const goToStep = useCallback((next: number) => {
    setStep(next);
    setCascadeStep(null);
    if (typeof window === "undefined" || !ready.current) return;
    const current = window.history.state as Record<string, unknown> | null;
    window.history.pushState(
      { ...(current ?? {}), [HISTORY_STEP_KEY]: next },
      "",
      window.location.href,
    );
  }, []);

  const stone = findStoneChoice(model, selection.stoneKey);
  const size: CustomFunnelVariantChoice | null = findVariantChoice(stone, selection.variantId);

  const draft = useMemo(
    () => buildCustomFunnelDraft({ model, catalogVersion, selection }),
    [catalogVersion, model, selection],
  );

  const catalogReady = typeof catalogVersion === "string" && isCatalogVersion(catalogVersion);

  const apply = (reduction: ReturnType<typeof reduceCustomFunnel>, stepIndex: number) => {
    if (!reduction.changed) return;
    onDraftInvalidated();
    setSelection(reduction.selection);
    setCascadeStep(reduction.clearedDownstream ? stepIndex : null);
  };

  const canAdvance =
    (step === 0 && stone !== null) || (step === 1 && size !== null) || (step >= 2 && step < 5);

  return (
    <>
      <nav aria-label={t("مراحل ساخت")} className="col-span-4 md:col-span-8 lg:col-span-3 lg:self-start">
        <ol className="flex flex-col gap-2 border border-border-subtle bg-surface p-4">
          {CUSTOM_FUNNEL_STEPS.map((label, index) => (
            <li
              key={label}
              aria-current={index === step ? "step" : undefined}
              className={
                index === step
                  ? "border-e-2 border-action-primary pe-2 text-sm font-bold text-text-primary"
                  : "pe-2 text-sm text-text-secondary"
              }
            >
              <span className="pe-1">{index + 1}.</span>
              {t(label)}
              {index === step ? <span className="ps-2 text-sm">{t("(مرحلهٔ جاری)")}</span> : null}
            </li>
          ))}
        </ol>
      </nav>

      <div className="col-span-4 flex flex-col gap-6 md:col-span-8 lg:col-span-9">
        <h2 className="text-lg font-bold text-text-primary">{t(CUSTOM_FUNNEL_STEPS[step])}</h2>

        <div role="status" aria-live="polite" className="text-sm text-text-secondary">
          {cascadeStep === step ? CASCADE_RESET_TEXT : null}
        </div>

        {step === 0 ? (
          <fieldset className="border border-border-subtle p-4">
            <legend className="px-2 text-sm font-bold text-text-primary">{t("انتخاب سنگ")}</legend>
            <div className="flex flex-col gap-3 pt-2">
              {model.stones.map((choice) => (
                <label key={choice.key} className={ROW} htmlFor={`stone-${choice.key}`}>
                  <input
                    type="radio"
                    id={`stone-${choice.key}`}
                    name="custom-funnel-stone"
                    className={CONTROL}
                    value={choice.key}
                    checked={selection.stoneKey === choice.key}
                    onChange={() =>
                      apply(
                        reduceCustomFunnel(selection, {
                          kind: "selectStone",
                          stoneKey: choice.key,
                        }),
                        0,
                      )
                    }
                  />
                  <span className="flex flex-col gap-1">
                    <span className="text-sm text-text-primary">{choice.productTitle}</span>
                    <span className="text-sm text-text-secondary">{t("سنگ:")}<bdi dir="ltr">{choice.stoneCode}</bdi>
                    </span>
                    <span className="text-sm text-text-caption">{t("کد محصول:")}<bdi dir="ltr">{choice.productCode}</bdi>
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        {step === 1 ? (
          stone === null ? (
            <p className="text-sm text-text-primary">{t(NO_STAGE_OPTIONS_TEXT)}</p>
          ) : (
            <fieldset className="border border-border-subtle p-4">
              <legend className="px-2 text-sm font-bold text-text-primary">{t("انتخاب اندازه")}</legend>
              <div className="flex flex-col gap-3 pt-2">
                {stone.sizes.map((choice) => (
                  <label
                    key={choice.variantId}
                    className={ROW}
                    htmlFor={`size-${choice.variantId}`}
                  >
                    <input
                      type="radio"
                      id={`size-${choice.variantId}`}
                      name="custom-funnel-size"
                      className={CONTROL}
                      value={choice.variantId}
                      checked={selection.variantId === choice.variantId}
                      onChange={() =>
                        apply(
                          reduceCustomFunnel(selection, {
                            kind: "selectSize",
                            variantId: choice.variantId,
                          }),
                          1,
                        )
                      }
                    />
                    <span className="text-sm text-text-primary">{choice.sizeLabel}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )
        ) : null}

        {step === 2 ? (
          <OptionStage
            legend={t("دوری مجاز")}
            name="dori"
            options={size?.dori ?? []}
            selectedIds={selection.doriIds}
            onToggle={(optionId) =>
              apply(reduceCustomFunnel(selection, { kind: "toggleDori", optionId }), 2)
            }
          />
        ) : null}

        {step === 3 ? (
          <OptionStage
            legend={t("قطعه کتیبه")}
            name="inscription"
            options={size?.inscriptionPiece ?? []}
            selectedIds={selection.inscriptionIds}
            onToggle={(optionId) =>
              apply(reduceCustomFunnel(selection, { kind: "toggleInscription", optionId }), 3)
            }
          />
        ) : null}

        {step === 4 ? (
          <OptionStage
            legend={t("حکاکی")}
            name="engraving"
            options={size?.engraving ?? []}
            selectedIds={selection.engravingIds}
            onToggle={(optionId) =>
              apply(reduceCustomFunnel(selection, { kind: "toggleEngraving", optionId }), 4)
            }
          />
        ) : null}

        {step === 5 ? (
          <div className="flex flex-col gap-6">
            {draft ? <ProductDraftSummary draft={draft} /> : null}
            <button
              type="button"
              className={ACTION}
              disabled={draft === null}
              onClick={() => {
                if (draft !== null) onDraftReady(draft);
              }}
            >
              {t(DELIVER_DRAFT_LABEL)}
            </button>
            {!catalogReady ? (
              <p className="text-sm text-text-secondary">{DRAFT_BLOCKED_TEXT}</p>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className={SECONDARY}
            disabled={step === 0}
            onClick={() => goToStep(step - 1)}
          >
            {t(PREVIOUS_STEP_LABEL)}
          </button>
          <button
            type="button"
            className={SECONDARY}
            disabled={!canAdvance}
            onClick={() => goToStep(step + 1)}
          >
            {t(NEXT_STEP_LABEL)}
          </button>
        </div>
      </div>
    </>
  );
}
