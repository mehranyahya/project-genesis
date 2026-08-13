import { LocaleLink, useT } from "@/lib/i18n/react";

import { PublicMedia } from "@/components/media/public-media";
import type { Media } from "@/lib/content/types";

/** Real media uses the 7/5 desktop split; absent media promotes copy to the full grid. */
export function HomeHero({ media }: { media: Media | null }) {
  const t = useT();
  return (
    <section className="mx-auto grid w-full max-w-[80rem] grid-cols-4 gap-x-4 gap-y-6 px-4 py-12 md:grid-cols-8 lg:grid-cols-12">
      <div
        className={`col-span-4 flex flex-col justify-center border border-border-control bg-surface-inverse p-6 md:col-span-8 lg:p-10 ${media ? "lg:col-span-7" : "lg:col-span-12 lg:min-h-[22rem]"}`}
      >
        <h1 className="max-w-[36ch] text-2xl font-bold text-text-inverse lg:text-3xl">
          {t("انتخاب و اجرای سنگ مزار با طراحی دقیق و متریال ماندگار")}
        </h1>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <LocaleLink
            to="/grave-stones"
            className="inline-flex min-h-11 items-center justify-center border border-text-inverse bg-action-primary px-5 py-2 text-sm font-bold text-text-inverse transition-colors duration-[180ms] hover:bg-text-inverse hover:text-surface-inverse focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-inverse motion-reduce:transition-none"
          >
            {t("انتخاب سنگ مزار")}
          </LocaleLink>
          <LocaleLink
            to="/portfolio"
            className="inline-flex min-h-11 items-center justify-center border border-text-inverse bg-surface-inverse px-5 py-2 text-sm font-bold text-text-inverse transition-colors duration-[180ms] hover:bg-text-inverse hover:text-surface-inverse focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-inverse motion-reduce:transition-none"
          >
            {t("مشاهده نمونه‌کارها")}
          </LocaleLink>
        </div>
      </div>

      {media ? (
        <div className="col-span-4 aspect-[4/5] overflow-hidden border border-border-subtle bg-surface-media md:col-span-8 lg:col-span-5">
          <PublicMedia
            media={media}
            fit="contain"
            priority
            sizes="(min-width: 1024px) 42vw, 100vw"
            className="block h-full w-full"
          />
        </div>
      ) : null}
    </section>
  );
}
