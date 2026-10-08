import { LocaleLink, useT } from "@/lib/i18n/react";
import { PublicMedia } from "@/components/media/public-media";
import type { Media } from "@/lib/content/types";

/** Text stays visible from SSR. Without editorial media, the composition is typographic. */
export function HomeHero({
  media,
  mobileMedia,
}: {
  media: Media | null;
  mobileMedia?: Media | null;
}) {
  const t = useT();
  return (
    <section
      className="inverse-surface bg-surface-inverse text-text-inverse"
      aria-labelledby="home-title"
    >
      <div className="site-container grid min-h-[30rem] grid-cols-4 items-center gap-x-8 gap-y-10 py-14 md:grid-cols-8 lg:grid-cols-12 lg:py-20">
        <div
          className={
            "col-span-4 flex flex-col justify-center md:col-span-8 " +
            (media ? "lg:col-span-7" : "lg:col-span-12 lg:min-h-[22rem]")
          }
        >
          <p className="mb-8 max-w-[56ch] text-sm text-text-inverse-secondary">
            {t("سنگ مزار · سنگ ساختمانی · ساخت سفارشی")}
          </p>
          <h1
            id="home-title"
            className="max-w-[19ch] text-[clamp(2.25rem,5vw,4rem)] font-medium text-text-inverse"
          >
            {t("زیبایی سنگ، دقت ساخت.")}
          </h1>
          <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
            <a
              href="#home-services"
              className="ui-action ui-action-inverse min-h-12 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-inverse"
            >
              {t("بررسی خدمات")}
              <span aria-hidden="true" className="link-arrow">
                →
              </span>
            </a>
            <LocaleLink
              to="/quote"
              className="editorial-link text-text-inverse focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-inverse"
            >
              {t("شروع گفت‌وگو")}
            </LocaleLink>
          </div>
        </div>
        {media ? (
          <div className="col-span-4 aspect-[3/2] overflow-hidden bg-surface-media md:col-span-8 lg:col-span-5 lg:aspect-[4/5]">
            <PublicMedia
              media={media}
              {...(mobileMedia ? { mobileMedia } : {})}
              fit="contain"
              priority
              sizes="(min-width: 1280px) 480px, (min-width: 1024px) 40vw, calc(100vw - 48px)"
              className="block h-full w-full"
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
