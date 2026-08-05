import { useRouter } from "@tanstack/react-router";

export const PORTFOLIO_LOADING_LABEL = "در حال دریافت نمونه‌کارها";
export const PORTFOLIO_EMPTY_TEXT = "در حال حاضر نمونه‌کار عمومی و دارای مجوز نمایش ثبت نشده است.";
export const PORTFOLIO_ERROR_TEXT = "دریافت نمونه‌کارها ممکن نشد.";
export const PORTFOLIO_RETRY_LABEL = "تلاش دوباره";

const SECTION =
  "mx-auto grid w-full max-w-[80rem] grid-cols-4 gap-x-4 gap-y-6 px-4 py-10 md:grid-cols-8 lg:grid-cols-12";
const FULL = "col-span-4 md:col-span-8 lg:col-span-12";
const ACTION =
  "inline-flex min-h-11 items-center justify-center border border-action-primary bg-action-primary px-5 py-2 text-sm font-bold text-text-inverse transition-colors duration-[180ms] hover:border-surface-inverse hover:bg-surface-inverse focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none";

/** Static structural skeleton. No motion, no shimmer, no sample content. */
export function PortfolioLoading() {
  return (
    <section className={SECTION} aria-busy="true" aria-label={PORTFOLIO_LOADING_LABEL}>
      <div
        aria-hidden="true"
        className={`${FULL} h-11 border border-border-subtle bg-surface-media`}
      />
      <div
        aria-hidden="true"
        className="col-span-4 grid grid-cols-4 gap-4 md:col-span-8 md:grid-cols-8 lg:col-span-12 lg:grid-cols-12"
      >
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            className="col-span-4 h-40 border border-border-subtle bg-surface-media md:col-span-4 lg:col-span-4"
          />
        ))}
      </div>
    </section>
  );
}

export function PortfolioEmpty() {
  return (
    <div role="status" className={`${FULL} border border-border-subtle bg-surface p-4`}>
      <p className="text-sm text-text-primary">{PORTFOLIO_EMPTY_TEXT}</p>
    </div>
  );
}

export function PortfolioError() {
  const router = useRouter();
  return (
    <section className={SECTION}>
      <div
        role="alert"
        className={`${FULL} flex flex-col items-start gap-4 border border-status-error bg-surface p-4`}
      >
        <h2 className="text-base font-bold text-text-primary">{PORTFOLIO_ERROR_TEXT}</h2>
        <button type="button" onClick={() => void router.invalidate()} className={ACTION}>
          {PORTFOLIO_RETRY_LABEL}
        </button>
      </div>
    </section>
  );
}
