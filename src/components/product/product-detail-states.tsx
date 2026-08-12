import { useRouter } from "@tanstack/react-router";
import { useT } from "@/lib/i18n/react";

export const PRODUCT_LOADING_LABEL = "در حال دریافت جزئیات سنگ مزار";
export const PRODUCT_ERROR_TEXT = "دریافت جزئیات سنگ مزار ممکن نشد.";
export const PRODUCT_RETRY_LABEL = "تلاش دوباره";

const SECTION =
  "mx-auto grid w-full max-w-[80rem] grid-cols-4 gap-x-4 gap-y-6 px-4 py-10 md:grid-cols-8 lg:grid-cols-12";

/** Static structural skeleton. No motion, no sample product, price or option. */
export function ProductDetailLoading() {
  const t = useT();
  return (
    <section className={SECTION} aria-busy="true" aria-label={t(PRODUCT_LOADING_LABEL)}>
      <div
        aria-hidden="true"
        className="col-span-4 aspect-[4/5] w-full border border-border-subtle bg-surface-media md:col-span-8 lg:col-span-7"
      />
      <div
        aria-hidden="true"
        className="col-span-4 flex flex-col gap-4 md:col-span-8 lg:col-span-5"
      >
        <div className="h-11 border border-border-subtle bg-surface-media" />
        <div className="h-40 border border-border-subtle bg-surface-media" />
        <div className="h-40 border border-border-subtle bg-surface-media" />
      </div>
    </section>
  );
}

export function ProductDetailError() {
  const t = useT();
  const router = useRouter();
  return (
    <section className={SECTION}>
      <div
        role="alert"
        className="col-span-4 flex flex-col items-start gap-4 border border-status-error bg-surface p-4 md:col-span-8 lg:col-span-12"
      >
        <h2 className="text-base font-bold text-text-primary">{t(PRODUCT_ERROR_TEXT)}</h2>
        <button
          type="button"
          onClick={() => void router.invalidate()}
          className="inline-flex min-h-11 items-center justify-center border border-action-primary bg-action-primary px-5 py-2 text-sm font-bold text-text-inverse transition-colors duration-[180ms] hover:border-surface-inverse hover:bg-surface-inverse focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none"
        >
          {t(PRODUCT_RETRY_LABEL)}
        </button>
      </div>
    </section>
  );
}
