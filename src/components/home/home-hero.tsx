import { Link } from "@tanstack/react-router";

/** Structural hero on a solid surface. No media, no overlay text. */
export function HomeHero() {
  return (
    <section className="mx-auto grid w-full max-w-[80rem] grid-cols-4 gap-x-4 gap-y-6 px-4 py-12 md:grid-cols-8 lg:grid-cols-12">
      <div className="col-span-4 border border-border-subtle bg-surface p-6 md:col-span-8 lg:col-span-12 lg:p-10">
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
    </section>
  );
}
