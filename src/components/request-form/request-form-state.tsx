import type { ReactNode } from "react";

import { formatMoney, priceTypeLabel } from "@/lib/product-detail";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locale";
import { useLocale, useT } from "@/lib/i18n/react";
import { SUBMIT_MESSAGES } from "@/lib/request-submit";
import type { SubmitOutcome, SubmitPrice } from "@/lib/request-submit";

const PANEL = "flex flex-col gap-3 border border-border-subtle bg-surface p-4";
const ACTION =
  "inline-flex min-h-11 items-center justify-center border border-action-primary bg-action-primary px-5 py-2 text-sm font-bold text-text-inverse transition-colors duration-[180ms] enabled:hover:border-surface-inverse enabled:hover:bg-surface-inverse disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none";

export function formatSubmitPrice(price: SubmitPrice, locale: Locale = DEFAULT_LOCALE): string {
  if (price.priceType === "review" || price.amountToman === null) {
    return priceTypeLabel("review", locale);
  }
  const amount = formatMoney(price.amountToman, locale);
  return price.priceType === "estimate"
    ? `${priceTypeLabel("estimate", locale)}: ${amount}`
    : `${priceTypeLabel("fixed", locale)}: ${amount}`;
}

/** Renders the non-success outcome states. Never shows a raw server message. */
export function RequestFormState({
  outcome,
  onRetry,
  onConfirmPrice,
  onNewAttempt,
}: {
  outcome: SubmitOutcome | null;
  onRetry: () => void;
  onConfirmPrice: () => void;
  onNewAttempt: () => void;
}): ReactNode {
  const t = useT();
  const locale = useLocale();
  if (outcome === null || outcome.kind === "success") return null;

  if (outcome.kind === "price_changed") {
    return (
      <section role="status" aria-live="polite" className={PANEL}>
        <p className="text-sm text-text-primary">{t(SUBMIT_MESSAGES.price_changed)}</p>
        <p className="text-sm text-text-secondary">{formatSubmitPrice(outcome.price, locale)}</p>
        <button type="button" className={ACTION} onClick={onConfirmPrice}>
          {t(SUBMIT_MESSAGES.price_changed_action)}
        </button>
      </section>
    );
  }

  if (outcome.kind === "selection_unavailable") {
    return (
      <section role="status" aria-live="polite" className={PANEL}>
        <p className="text-sm text-text-primary">{t(SUBMIT_MESSAGES.selection_unavailable)}</p>
      </section>
    );
  }

  if (outcome.kind === "terms_updated") {
    return (
      <section role="status" aria-live="polite" className={PANEL}>
        <p className="text-sm text-text-primary">{t(SUBMIT_MESSAGES.terms_updated)}</p>
      </section>
    );
  }

  if (outcome.kind === "idempotency_conflict" || outcome.kind === "idempotency_expired") {
    return (
      <section role="status" aria-live="polite" className={PANEL}>
        <p className="text-sm text-text-primary">{t(SUBMIT_MESSAGES.idempotency)}</p>
        <button type="button" className={ACTION} onClick={onNewAttempt}>
          {t(SUBMIT_MESSAGES.idempotency_action)}
        </button>
      </section>
    );
  }

  if (outcome.kind === "validation_error") {
    return (
      <section role="alert" className={PANEL}>
        <p className="text-sm text-text-primary">
          {t("خطا")}: {t(SUBMIT_MESSAGES.validation_error)}
        </p>
      </section>
    );
  }

  if (outcome.kind === "bot_verification_invalid") {
    return (
      <section role="alert" className={PANEL}>
        <p className="text-sm text-text-primary">
          {t("خطا")}: {t(SUBMIT_MESSAGES.bot_verification_invalid)}
        </p>
        <button type="button" className={ACTION} onClick={onRetry}>
          {t(SUBMIT_MESSAGES.retry_action)}
        </button>
      </section>
    );
  }

  if (outcome.kind === "rate_limited") {
    return (
      <section role="alert" className={PANEL}>
        <p className="text-sm text-text-primary">
          {t("خطا")}: {t(SUBMIT_MESSAGES.rate_limited)}
        </p>
      </section>
    );
  }

  return (
    <section role="alert" className={PANEL}>
      <p className="text-sm text-text-primary">
        {t("خطا")}: {t(SUBMIT_MESSAGES.temporarily_unavailable)}
      </p>
      <button type="button" className={ACTION} onClick={onRetry}>
        {t(SUBMIT_MESSAGES.retry_action)}
      </button>
    </section>
  );
}
