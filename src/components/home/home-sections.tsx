import { LocaleLink, useLocale, useT } from "@/lib/i18n/react";
import { HomeLinkCard } from "./home-link-card";
import { PublicMedia } from "@/components/media/public-media";
import type { Media } from "@/lib/content/types";
import type { HomeGuideItem, HomeProjectItem, HomeServiceKey } from "@/lib/home";
import { buildQuoteReferralPath } from "@/lib/portfolio-reference";
import { localizeRawPath } from "@/lib/i18n/locale";
import type { Locale } from "@/lib/i18n/locale";

const SECTION_GRID =
  "site-container section-space grid grid-cols-4 gap-x-6 gap-y-8 md:grid-cols-8 lg:grid-cols-12";
const FULL_SPAN = "col-span-4 md:col-span-8 lg:col-span-12";

function workHref(reference: string, locale: Locale): string {
  const referral = buildQuoteReferralPath(reference) ?? "/portfolio";
  const queryAt = referral.indexOf("?");
  const pathname = queryAt === -1 ? referral : referral.slice(0, queryAt);
  const query = queryAt === -1 ? "" : referral.slice(queryAt);
  return localizeRawPath(pathname, locale) + query;
}

export const CHOICE_PATHS = [
  {
    key: "memorial",
    label: "سنگ مزار",
    description: "انتخاب مدل، اندازه و جزئیات برای یک یادمان شخصی.",
    to: "/grave-stones",
  },
  {
    key: "architectural",
    label: "سنگ ساختمانی",
    description: "بررسی سنگ، ابعاد و کاربرد متناسب با پروژهٔ معماری.",
    to: "/building-stone",
  },
  {
    key: "bespoke",
    label: "ساخت سفارشی",
    description: "بررسی ایده، جنس و جزئیات برای ساخت یک اثر سنگی.",
    to: "/stoneworks",
  },
] as const;

export const PROCESS_STEPS = [
  "انتخاب خدمت",
  "شرح نیاز و جزئیات",
  "ثبت برای بررسی",
  "هماهنگی برای تأیید نهایی",
] as const;

export function HomeChoicePaths({
  media,
}: {
  media: Readonly<Record<HomeServiceKey, Media | null>>;
}) {
  const t = useT();
  const locale = useLocale();
  const number = new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en", {
    minimumIntegerDigits: 2,
  });
  return (
    <section id="home-services" tabIndex={-1} className={SECTION_GRID} aria-labelledby="home-paths">
      <h2 id="home-paths" className={FULL_SPAN + " section-heading"}>
        {t("سه مسیر، یک متریال")}
      </h2>
      <div className={FULL_SPAN + " grid auto-rows-fr gap-5 md:grid-cols-3"}>
        {CHOICE_PATHS.map((item, index) => (
          <HomeLinkCard
            key={item.key}
            label={t(item.label)}
            description={t(item.description)}
            to={item.to}
            index={number.format(index + 1)}
            media={media[item.key]}
          />
        ))}
      </div>
    </section>
  );
}

export function HomeProcess() {
  const t = useT();
  const locale = useLocale();
  const number = new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en", {
    minimumIntegerDigits: 2,
  });
  return (
    <section className="border-y border-border-subtle bg-surface" aria-labelledby="home-process">
      <div className={SECTION_GRID}>
        <h2 id="home-process" className={FULL_SPAN + " section-heading"}>
          {t("از انتخاب تا بررسی")}
        </h2>
        <ol className={FULL_SPAN + " grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4"}>
          {PROCESS_STEPS.map((label, index) => (
            <li key={label} className="border-t border-border-control pt-5">
              <span aria-hidden="true" className="numeric text-sm text-text-secondary">
                {number.format(index + 1)}
              </span>
              <h3 className="mt-3 text-xl">{t(label)}</h3>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function HomePortfolio({ projects }: { projects: readonly HomeProjectItem[] }) {
  const t = useT();
  const locale = useLocale();
  return (
    <section className={SECTION_GRID} aria-labelledby="home-portfolio">
      <div className={FULL_SPAN + " flex flex-wrap items-center justify-between gap-4"}>
        <h2 id="home-portfolio" className="section-heading">
          {t("آثار منتخب")}
        </h2>
        <LocaleLink
          to="/portfolio"
          className="editorial-link min-h-12 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {t("مشاهده نمونه‌کارها")}
        </LocaleLink>
      </div>
      <ul className={FULL_SPAN + " grid gap-6 md:grid-cols-3"}>
        {projects.map((project) => (
          <li key={project.publicReferenceId}>
            <a
              href={workHref(project.publicReferenceId, locale)}
              className="block min-h-12 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <div className="aspect-[3/2] overflow-hidden bg-surface-media">
                <PublicMedia
                  media={project.media}
                  sizes="(min-width: 1280px) 390px, (min-width: 768px) 30vw, calc(100vw - 48px)"
                  className="block h-full w-full"
                />
              </div>
              <h3 className="mt-4 text-xl">
                {t(CHOICE_PATHS.find((item) => item.key === project.service)!.label)}
              </h3>
              {project.summary ? (
                <p className="mt-2 text-sm text-text-secondary">{project.summary}</p>
              ) : null}
              <span className="editorial-link">
                {t("بررسی اجرای مشابه")}{" "}
                <span aria-hidden="true" className="link-arrow">
                  →
                </span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function HomeGuide({ guide }: { guide: HomeGuideItem }) {
  const t = useT();
  return (
    <section className={SECTION_GRID} aria-labelledby="home-guide">
      <h2 id="home-guide" className={FULL_SPAN + " section-heading"}>
        {t("راهنمای انتخاب")}
      </h2>
      <LocaleLink
        to="/guides/$slug"
        params={{ slug: guide.slug }}
        className={
          FULL_SPAN +
          " flex min-h-12 flex-col gap-3 border-t border-border-control py-6 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        }
      >
        <h3 className="text-2xl text-text-primary">{guide.title}</h3>
        {guide.summary ? (
          <p className="max-w-[65ch] text-base text-text-secondary">{guide.summary}</p>
        ) : null}
        <span className="editorial-link">
          {t("خواندن راهنما")}{" "}
          <span aria-hidden="true" className="link-arrow">
            →
          </span>
        </span>
      </LocaleLink>
    </section>
  );
}

export function HomeFinalCta() {
  const t = useT();
  return (
    <section className="site-container section-space" aria-labelledby="home-final-cta">
      <div className="inverse-surface bg-surface-inverse px-6 py-12 text-text-inverse md:px-12 md:py-16">
        <h2 id="home-final-cta" className="section-heading max-w-[32ch]">
          {t("برای انتخاب یا ساخت سنگ، گفت‌وگو را شروع کنیم.")}
        </h2>
        <p className="mt-5 mb-8 max-w-[65ch] text-sm text-text-inverse-secondary">
          {t("ثبت درخواست برای بررسی جزئیات است و به معنی شروع تولید یا الزام به پرداخت نیست.")}
        </p>
        <LocaleLink
          to="/quote"
          className="ui-action ui-action-inverse min-h-12 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-inverse"
        >
          {t("شروع گفت‌وگو")}{" "}
          <span aria-hidden="true" className="link-arrow">
            →
          </span>
        </LocaleLink>
      </div>
    </section>
  );
}
