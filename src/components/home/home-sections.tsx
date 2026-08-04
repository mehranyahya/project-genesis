import { Link } from "@tanstack/react-router";

import { HomeLinkCard } from "./home-link-card";
import type { HomeGuideItem, HomeProductItem } from "@/lib/home";

const SECTION_GRID =
  "mx-auto grid w-full max-w-[80rem] grid-cols-4 gap-x-4 gap-y-6 px-4 py-10 md:grid-cols-8 lg:grid-cols-12";
const FULL_SPAN = "col-span-4 md:col-span-8 lg:col-span-12";
const HEADING = "text-xl font-bold text-text-primary";

export const CHOICE_PATHS = [
  { label: "فروشگاه سنگ مزار", to: "/grave-stones" },
  { label: "سفارش سفارشی", to: "/grave-stones/custom" },
  { label: "نمونه‌کارها", to: "/portfolio" },
] as const;

export const PROCESS_STEPS = [
  "انتخاب سنگ",
  "انتخاب اندازه و جزئیات",
  "بازبینی خلاصه",
  "ثبت برای بررسی",
] as const;

export function HomeChoicePaths() {
  return (
    <section className={SECTION_GRID} aria-labelledby="home-paths">
      <h2 id="home-paths" className={`${FULL_SPAN} ${HEADING}`}>
        مسیر انتخاب
      </h2>
      <div className="col-span-4 grid grid-cols-4 gap-4 md:col-span-8 md:grid-cols-8 lg:col-span-12 lg:grid-cols-12">
        {CHOICE_PATHS.map((item) => (
          <HomeLinkCard key={item.to} label={item.label} to={item.to} />
        ))}
      </div>
    </section>
  );
}

export function HomeProcess() {
  return (
    <section className={SECTION_GRID} aria-labelledby="home-process">
      <h2 id="home-process" className={`${FULL_SPAN} ${HEADING}`}>
        مراحل سفارش
      </h2>
      <ol className={`${FULL_SPAN} grid grid-cols-4 gap-4 md:grid-cols-8 lg:grid-cols-12`}>
        {PROCESS_STEPS.map((label, index) => (
          <li
            key={label}
            className="col-span-4 flex min-h-11 items-center gap-3 border border-border-subtle bg-surface px-4 py-4 md:col-span-4 lg:col-span-3"
          >
            <span aria-hidden="true" className="text-base font-bold text-decorative-accent">
              {index + 1}
            </span>
            <span className="text-sm text-text-primary">{label}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function HomeFeaturedProducts({ products }: { products: readonly HomeProductItem[] }) {
  return (
    <section className={SECTION_GRID} aria-labelledby="home-products">
      <h2 id="home-products" className={`${FULL_SPAN} ${HEADING}`}>
        سنگ‌های مزار منتخب
      </h2>
      <ul className={`${FULL_SPAN} grid grid-cols-4 gap-4 md:grid-cols-8 lg:grid-cols-12`}>
        {products.map((product) => (
          <li key={product.slug} className="col-span-4 md:col-span-4 lg:col-span-4">
            <Link
              to="/grave-stones/$slug"
              params={{ slug: product.slug }}
              className="flex min-h-11 flex-col gap-2 border border-border-subtle bg-surface px-4 py-5 transition-colors duration-[180ms] hover:border-border-control hover:bg-surface-media focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none"
            >
              <span className="text-base font-bold text-text-primary">{product.title}</span>
              {product.summary ? (
                <span className="text-sm text-text-secondary">{product.summary}</span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function HomePortfolio() {
  return (
    <section className={SECTION_GRID} aria-labelledby="home-portfolio">
      <h2 id="home-portfolio" className={`${FULL_SPAN} ${HEADING}`}>
        نمونه‌کار منتخب
      </h2>
      <div className={FULL_SPAN}>
        <Link
          to="/portfolio"
          className="inline-flex min-h-11 items-center justify-center border border-border-control bg-surface px-5 py-2 text-sm font-bold text-text-primary transition-colors duration-[180ms] hover:bg-surface-media focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none"
        >
          مشاهده نمونه‌کارها
        </Link>
      </div>
    </section>
  );
}

export function HomeGuide({ guide }: { guide: HomeGuideItem }) {
  return (
    <section className={SECTION_GRID} aria-labelledby="home-guide">
      <h2 id="home-guide" className={`${FULL_SPAN} ${HEADING}`}>
        راهنمای انتخاب
      </h2>
      <div className={FULL_SPAN}>
        <Link
          to="/guides/$slug"
          params={{ slug: guide.slug }}
          className="flex min-h-11 flex-col gap-2 border border-border-subtle bg-surface px-4 py-5 transition-colors duration-[180ms] hover:border-border-control hover:bg-surface-media focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none"
        >
          <span className="text-base font-bold text-text-primary">{guide.title}</span>
          {guide.summary ? (
            <span className="text-sm text-text-secondary">{guide.summary}</span>
          ) : null}
        </Link>
      </div>
    </section>
  );
}

export function HomeBuildingStone() {
  return (
    <section className={SECTION_GRID} aria-labelledby="home-building-stone">
      <h2 id="home-building-stone" className={`${FULL_SPAN} ${HEADING}`}>
        سنگ ساختمانی
      </h2>
      <div className={FULL_SPAN}>
        <Link
          to="/building-stone"
          className="inline-flex min-h-11 items-center justify-center border border-border-control bg-surface px-5 py-2 text-sm font-bold text-text-primary transition-colors duration-[180ms] hover:bg-surface-media focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none"
        >
          بررسی سنگ ساختمانی
        </Link>
      </div>
    </section>
  );
}

export function HomeFinalCta() {
  return (
    <section className={SECTION_GRID} aria-labelledby="home-final-cta">
      <div className={`${FULL_SPAN} border border-border-subtle bg-surface p-6`}>
        <h2 id="home-final-cta" className={HEADING}>
          برای انتخاب سنگ مزار آماده‌اید؟
        </h2>
        <p className="mt-3 max-w-[60ch] text-sm text-text-secondary">
          ثبت سفارش برای بررسی موجودی، محل اجرا و جزئیات نهایی است و به معنی شروع تولید یا الزام به
          پرداخت نیست.
        </p>
        <Link
          to="/grave-stones"
          className="mt-6 inline-flex min-h-11 items-center justify-center border border-action-primary bg-action-primary px-5 py-2 text-sm font-bold text-text-inverse transition-colors duration-[180ms] hover:border-surface-inverse hover:bg-surface-inverse focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none"
        >
          انتخاب و ثبت سفارش
        </Link>
      </div>
    </section>
  );
}
