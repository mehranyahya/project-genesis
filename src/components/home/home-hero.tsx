import { LocaleLink, useT } from "@/lib/i18n/react";
import { PublicMedia } from "@/components/media/public-media";
import type { Media } from "@/lib/content/types";

/** Copy is visible in SSR, with or without a neutral material photograph. */
export function HomeHero({ media }: { media: Media | null }) {
  const t = useT();
  return (
    <section className="on-dark bg-surface-inverse text-text-inverse" aria-labelledby="home-title">
      <div className="page-section grid min-h-[32rem] items-center gap-10 lg:grid-cols-12 lg:gap-16 lg:py-24">
        <div
          className={`flex flex-col justify-center ${media ? "lg:col-span-7" : "lg:col-span-12"}`}
        >
          <p className="mb-6 text-sm text-text-inverse-secondary">
            {t("سنگ مزار · سنگ ساختمانی · ساخت سفارشی")}
          </p>
          <h1
            id="home-title"
            className="max-w-[18ch] text-[clamp(2.5rem,5.5vw,4rem)] leading-[1.25] font-medium"
          >
            {t("زیبایی سنگ، دقت ساخت.")}
          </h1>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <a
              href="#home-services"
              className="inline-flex min-h-12 items-center justify-center rounded-sm border border-text-inverse bg-text-inverse px-7 py-3 text-base font-medium text-surface-inverse transition-colors duration-[180ms] hover:bg-text-inverse-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-inverse motion-reduce:transition-none"
            >
              {t("بررسی خدمات")}
            </a>
            <LocaleLink
              to="/quote"
              className="inline-flex min-h-12 items-center border-b border-text-inverse px-2 text-base text-text-inverse transition-colors duration-[180ms] hover:text-text-inverse-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-inverse motion-reduce:transition-none"
            >
              {t("شروع گفت‌وگو")}
            </LocaleLink>
          </div>
        </div>

        {media ? (
          <div className="aspect-[3/2] overflow-hidden bg-surface-media lg:col-span-5 lg:aspect-[4/5]">
            <PublicMedia
              media={media}
              fit="contain"
              priority
              sizes="(min-width: 1280px) 480px, (min-width: 1024px) 40vw, calc(100vw - 40px)"
              className="block h-full w-full"
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
