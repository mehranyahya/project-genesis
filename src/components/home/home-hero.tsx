import { Link } from "@tanstack/react-router";

import { PublicMedia } from "@/components/media/public-media";
import type { Media } from "@/lib/content/types";

/** Seven-column copy plus five-column real-media stage on desktop. */
export function HomeHero({ media }: { media: Media | null }) {
  return (
    <section className="mx-auto grid w-full max-w-[80rem] grid-cols-4 gap-x-4 gap-y-6 px-4 py-12 md:grid-cols-8 lg:grid-cols-12">
      <div className="col-span-4 border border-border-subtle bg-surface p-6 md:col-span-8 lg:col-span-7 lg:p-10">
        <h1 className="max-w-[36ch] text-2xl font-bold text-text-primary lg:text-3xl">
          انتخاب و اجرای سنگ مزار با طراحی دقیق و متریال ماندگار
        </h1>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            to="/grave-stones"
            className="inline-flex min-h-11 items-center justify-center border border-action-primary bg-action-primary px-5 py-2 text-sm font-bold text-text-inverse transition-colors duration-[180ms] hover:border-surface-inverse hover:bg-surface-inverse focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none"
          >
            انتخاب سنگ مزار
          </Link>
          <Link
            to="/portfolio"
            className="inline-flex min-h-11 items-center justify-center border border-border-control bg-surface px-5 py-2 text-sm font-bold text-text-primary transition-colors duration-[180ms] hover:bg-surface-media focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none"
          >
            مشاهده نمونه‌کارها
          </Link>
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
