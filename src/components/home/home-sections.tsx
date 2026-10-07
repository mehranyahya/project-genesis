import { LocaleLink, useLocale, useT } from "@/lib/i18n/react";

import { HomeLinkCard } from "./home-link-card";
import { PublicMedia } from "@/components/media/public-media";
import type { HomeGuideItem, HomeProject, HomeService, HomeViewModel } from "@/lib/home";

export const CHOICE_PATHS = [
  {
    service: "grave_stone",
    label: "سنگ مزار",
    to: "/grave-stones",
    description: "بررسی مدل، اندازه و جزئیات یک یادمان.",
  },
  {
    service: "building_stone",
    label: "سنگ ساختمانی",
    to: "/building-stone",
    description: "انتخاب سنگ متناسب با کاربرد و مشخصات پروژه.",
  },
  {
    service: "stoneworks",
    label: "ساخت سفارشی",
    to: "/stoneworks",
    description: "بررسی ایده، ابعاد و جزئیات ساخت یک قطعهٔ سنگی.",
  },
] as const;

export const PROCESS_STEPS = [
  "انتخاب مسیر",
  "ثبت مشخصات",
  "بررسی درخواست",
  "هماهنگی جزئیات",
] as const;

export function HomeChoicePaths({ media }: { media: HomeViewModel["serviceMedia"] }) {
  const t = useT();
  return (
    <section id="home-services" className="page-section" aria-labelledby="home-paths">
      <h2 id="home-paths" className="section-title">
        {t("سه مسیر، یک مادهٔ ماندگار")}
      </h2>
      <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {CHOICE_PATHS.map((item) => (
          <HomeLinkCard
            key={item.to}
            label={t(item.label)}
            description={t(item.description)}
            to={item.to}
            media={media[item.service]}
          />
        ))}
      </div>
    </section>
  );
}

export function HomeProcess() {
  const t = useT();
  const locale = useLocale();
  return (
    <section className="page-section border-t border-border-subtle" aria-labelledby="home-process">
      <h2 id="home-process" className="section-title">
        {t("از انتخاب تا بررسی")}
      </h2>
      <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {PROCESS_STEPS.map((label, index) => (
          <li key={label} className="border-t border-border-control pt-6">
            <span aria-hidden="true" className="numeric text-sm text-text-caption">
              {new Intl.NumberFormat(locale === "en" ? "en" : "fa").format(index + 1)}
            </span>
            <p className="mt-4 text-base font-medium">{t(label)}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

const PROJECT_LABELS: Record<HomeService, string> = {
  grave_stone: "سنگ مزار",
  building_stone: "سنگ ساختمانی",
  stoneworks: "ساخت سفارشی",
};

export function HomePortfolio({ projects }: { projects: readonly HomeProject[] }) {
  const t = useT();
  return (
    <section className="page-section" aria-labelledby="home-portfolio">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h2 id="home-portfolio" className="section-title">
          {t("نمونه‌کارهای منتخب")}
        </h2>
        <LocaleLink
          to="/portfolio"
          className="editorial-link inline-flex min-h-12 items-center text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {t("مشاهده نمونه‌کارها")}
        </LocaleLink>
      </div>
      <ul className="mt-10 grid gap-6 md:grid-cols-3">
        {projects.map(({ service, item }) => (
          <li key={service}>
            <LocaleLink
              to="/quote"
              search={() => ({ source: "portfolio", reference: item.publicReferenceId })}
              className="block min-h-12 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <div className="aspect-[3/2] overflow-hidden bg-surface-media">
                <PublicMedia
                  media={item.media[0]!}
                  fit="contain"
                  sizes="(min-width: 1280px) 395px, (min-width: 768px) 31vw, calc(100vw - 40px)"
                  className="block h-full w-full"
                />
              </div>
              <h3 className="mt-5 text-xl">{t(PROJECT_LABELS[service])}</h3>
              {item.summary ? (
                <p className="mt-2 text-sm text-text-secondary">{item.summary}</p>
              ) : null}
            </LocaleLink>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function HomeGuide({ guide }: { guide: HomeGuideItem }) {
  const t = useT();
  return (
    <section className="page-section border-t border-border-subtle" aria-labelledby="home-guide">
      <h2 id="home-guide" className="section-title">
        {t("راهنمای انتخاب")}
      </h2>
      <LocaleLink
        to="/guides/$slug"
        params={{ slug: guide.slug }}
        className="mt-8 flex min-h-12 flex-col gap-3 border-t border-border-control py-6 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <span className="text-xl">{guide.title}</span>
        {guide.summary ? (
          <span className="max-w-[65ch] text-base text-text-secondary">{guide.summary}</span>
        ) : null}
      </LocaleLink>
    </section>
  );
}

export function HomeFinalCta() {
  const t = useT();
  return (
    <section className="page-section border-t border-border-subtle" aria-labelledby="home-final-cta">
      <div className="grid items-start gap-8 lg:grid-cols-12">
        <h2 id="home-final-cta" className="section-title max-w-[28ch] lg:col-span-7">
          {t("برای انتخاب یا ساخت سنگ، گفت‌وگو را شروع کنیم.")}
        </h2>
        <div className="lg:col-span-5">
          <p className="max-w-[48ch] text-base text-text-secondary">
            {t("ثبت درخواست برای بررسی جزئیات است و به معنی شروع تولید یا الزام به پرداخت نیست.")}
          </p>
          <LocaleLink
            to="/quote"
            className="mt-7 inline-flex min-h-12 items-center justify-center rounded-sm border border-action-primary bg-action-primary px-7 py-3 text-base font-medium text-text-inverse transition-colors duration-[180ms] hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none"
          >
            {t("شروع گفت‌وگو")}
          </LocaleLink>
        </div>
      </div>
    </section>
  );
}
