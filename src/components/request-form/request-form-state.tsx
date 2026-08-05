import type { ReactNode } from "react";

import { PRICE_TYPE_LABELS, formatAmount } from "@/lib/product-detail";
import { SUBMIT_MESSAGES } from "@/lib/request-submit";
import type { SubmitOutcome, SubmitPrice } from "@/lib/request-submit";

const PANEL = "flex flex-col gap-3 border border-border-subtle bg-surface p-4";
const ACTION =
  "inline-flex min-h-11 items-center justify-center border border-action-primary bg-action-primary px-5 py-2 text-sm font-bold text-text-inverse transition-colors duration-[180ms] enabled:hover:border-surface-inverse enabled:hover:bg-surface-inverse disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none";

export function formatSubmitPrice(price: SubmitPrice): string {
  if (price.priceType === "review" || price.amountToman === null) {
    return PRICE_TYPE_LABELS.review;
  }
  const amount = `${formatAmount(price.amountToman)} تومان`;
  return price.priceType === "estimate"
    ? `${PRICE_TYPE_LABELS.estimate}: ${amount}`
    : `${PRICE_TYPE_LABELS.fixed}: ${amount}`;
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
  if (outcome === null || outcome.kind === "success") return null;

  if (outcome.kind === "price_changed") {
    return (
      <section role="status" aria-live="polite" className={PANEL}>
        <p className="text-sm text-text-primary">{SUBMIT_MESSAGES.price_changed}</p>
        <p className="text-sm text-text-secondary">{formatSubmitPrice(outcome.price)}</p>
        <button type="button" className={ACTION} onClick={onConfirmPrice}>
          {SUBMIT_MESSAGES.price_changed_action}
        </button>
      </section>
    );
  }

  if (outcome.kind === "selection_unavailable") {
    return (
      <section role="status" aria-live="polite" className={PANEL}>
        <p className="text-sm text-text-primary">{SUBMIT_MESSAGES.selection_unavailable}</p>
      </section>
    );
  }

  if (outcome.kind === "terms_updated") {
    return (
      <section role="status" aria-live="polite" className={PANEL}>
        <p className="text-sm text-text-primary">{SUBMIT_MESSAGES.terms_updated}</p>
      </section>
    );
  }

  if (outcome.kind === "idempotency_conflict" || outcome.kind === "idempotency_expired") {
    return (
      <section role="status" aria-live="polite" className={PANEL}>
        <p className="text-sm text-text-primary">{SUBMIT_MESSAGES.idempotency}</p>
      </section>
    );
  }

  if (outcome.kind === "validation_error") {
    return (
      <section role="alert" className={PANEL}>
        <p className="text-sm text-text-primary">خطا: {SUBMIT_MESSAGES.validation_error}</p>
      </section>
    );
  }

  if (outcome.kind === "bot_verification_invalid") {
    return (
      <section role="alert" className={PANEL}>
        <p className="text-sm text-text-primary">خطا: {SUBMIT_MESSAGES.bot_verification_invalid}</p>
        <button type="button" className={ACTION} onClick={onRetry}>
          {SUBMIT_MESSAGES.retry_action}
        </button>
      </section>
    );
  }

  if (outcome.kind === "rate_limited") {
    return (
      <section role="alert" className={PANEL}>
        <p className="text-sm text-text-primary">خطا: {SUBMIT_MESSAGES.rate_limited}</p>
      </section>
    );
  }

  return (
    <section role="alert" className={PANEL}>
      <p className="text-sm text-text-primary">خطا: {SUBMIT_MESSAGES.temporarily_unavailable}</p>
      <button type="button" className={ACTION} onClick={onRetry}>
        {SUBMIT_MESSAGES.retry_action}
      </button>
    </section>
  );
}
