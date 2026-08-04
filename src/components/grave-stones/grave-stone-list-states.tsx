import { Link, useRouter } from "@tanstack/react-router";

export const CATALOG_EMPTY_TEXT = "در حال حاضر محصول فعالی برای نمایش وجود ندارد.";
export const FILTERED_EMPTY_TEXT = "با این فیلترها محصولی پیدا نشد.";
export const LOADING_LABEL = "در حال دریافت فهرست سنگ مزار";
export const ERROR_TEXT = "دریافت فهرست سنگ مزار ممکن نشد.";
export const RETRY_LABEL = "تلاش دوباره";

const SECTION =
  "mx-auto grid w-full max-w-[80rem] grid-cols-4 gap-x-4 gap-y-6 px-4 py-10 md:grid-cols-8 lg:grid-cols-12";
const FULL = "col-span-4 md:col-span-8 lg:col-span-12";
const ACTION =
  "inline-flex min-h-11 items-center justify-center border border-action-primary bg-action-primary px-5 py-2 text-sm font-bold text-text-inverse transition-colors duration-[180ms] hover:border-surface-inverse hover:bg-surface-inverse focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none";

export function GraveStoneCatalogEmpty() {
  return (
    <div className={`${FULL} flex flex-col items-start gap-4 border border-border-subtle bg-surface p-4`}>
      <p className="text-sm text-text-primary">{CATALOG_EMPTY_TEXT}</p>
      <Link to="/grave-stones/custom" className={ACTION}>
        ثبت سفارش سفارشی
      </Link>
    </div>
  );
}

export function GraveStoneFilteredEmpty({ onReset }: { onReset: () => void }) {
  return (
    <div className={`${FULL} flex flex-col items-start gap-4 border border-border-subtle bg-surface p-4`}>
      <p className="text-sm text-text-primary">{FILTERED_EMPTY_TEXT}</p>
      <button
        type="button"
        onClick={onReset}
        className="inline-flex min-h-11 items-center border border-border-control bg-surface px-5 py-2 text-sm font-bold text-text-primary transition-colors duration-[180ms] hover:bg-surface-media focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none"
      >
        پاک‌کردن فیلترها
      </button>
    </div>
  );
}

/** Static structural skeleton. No motion, no shimmer, no sample product data. */
export function GraveStoneListLoading() {
  return (
    <section className={SECTION} aria-busy="true" aria-label={LOADING_LABEL}>
      <div aria-hidden="true" className={`${FULL} h-11 border border-border-subtle bg-surface-media`} />
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

export function GraveStoneListError() {
  const router = useRouter();
  return (
    <section className={SECTION}>
      <div
        role="alert"
        className={`${FULL} flex flex-col items-start gap-4 border border-status-error bg-surface p-4`}
      >
        <h2 className="text-base font-bold text-text-primary">{ERROR_TEXT}</h2>
        <button type="button" onClick={() => void router.invalidate()} className={ACTION}>
          {RETRY_LABEL}
        </button>
      </div>
    </section>
  );
}
