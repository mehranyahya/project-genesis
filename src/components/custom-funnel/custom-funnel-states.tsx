import { useRouter } from "@tanstack/react-router";

export const CUSTOM_FUNNEL_LOADING_LABEL = "در حال دریافت گزینه‌های ساخت مرحله‌ای";
export const CUSTOM_FUNNEL_ERROR_TEXT = "دریافت گزینه‌های ساخت مرحله‌ای ممکن نشد.";
export const CUSTOM_FUNNEL_RETRY_LABEL = "تلاش دوباره";
export const CUSTOM_FUNNEL_EMPTY_TEXT = "در حال حاضر گزینهٔ کاملی برای ساخت مرحله‌ای ثبت نشده است.";

const SECTION =
  "mx-auto grid w-full max-w-[80rem] grid-cols-4 gap-x-4 gap-y-6 px-4 py-10 md:grid-cols-8 lg:grid-cols-12";

/** Static structural skeleton with final dimensions. No motion, no sample data. */
export function CustomFunnelLoading() {
  return (
    <section className={SECTION} aria-busy="true" aria-label={CUSTOM_FUNNEL_LOADING_LABEL}>
      <div
        aria-hidden="true"
        className="col-span-4 flex flex-col gap-3 md:col-span-8 lg:col-span-3"
      >
        <div className="h-11 border border-border-subtle bg-surface-media" />
        <div className="h-64 border border-border-subtle bg-surface-media" />
      </div>
      <div
        aria-hidden="true"
        className="col-span-4 flex flex-col gap-4 md:col-span-8 lg:col-span-9"
      >
        <div className="h-11 border border-border-subtle bg-surface-media" />
        <div className="h-56 border border-border-subtle bg-surface-media" />
        <div className="h-11 border border-border-subtle bg-surface-media" />
      </div>
    </section>
  );
}

export function CustomFunnelError() {
  const router = useRouter();
  return (
    <section className={SECTION}>
      <div
        role="alert"
        className="col-span-4 flex flex-col items-start gap-4 border border-status-error bg-surface p-4 md:col-span-8 lg:col-span-12"
      >
        <h2 className="text-base font-bold text-text-primary">{CUSTOM_FUNNEL_ERROR_TEXT}</h2>
        <button
          type="button"
          onClick={() => void router.invalidate()}
          className="inline-flex min-h-11 items-center justify-center border border-action-primary bg-action-primary px-5 py-2 text-sm font-bold text-text-inverse transition-colors duration-[180ms] hover:border-surface-inverse hover:bg-surface-inverse focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none"
        >
          {CUSTOM_FUNNEL_RETRY_LABEL}
        </button>
      </div>
    </section>
  );
}

/** Real empty / classification-blocked state. No placeholder product or CTA. */
export function CustomFunnelEmpty() {
  return (
    <div className="col-span-4 border border-border-subtle bg-surface p-4 md:col-span-8 lg:col-span-12">
      <p className="text-sm text-text-primary">{CUSTOM_FUNNEL_EMPTY_TEXT}</p>
    </div>
  );
}
