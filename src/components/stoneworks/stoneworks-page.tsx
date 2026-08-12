import { LocaleLink, useT } from "@/lib/i18n/react";
import {
  STONEWORKS_CATEGORIES_HEADING,
  STONEWORKS_CTA_LABEL,
  STONEWORKS_CTA_TEMPLATE,
  STONEWORKS_HEADING,
  STONEWORKS_INTRO,
  STONEWORKS_PRICE_STATE_LABEL,
  STONEWORKS_PRICE_STATE_PREFIX,
  STONEWORKS_PROCESS_HEADING,
  STONEWORKS_PROCESS_STEPS,
  STONEWORK_CATEGORIES,
  stoneworkAnchorId,
  stoneworkHeadingId,
} from "@/lib/stoneworks";

const SECTION =
  "mx-auto grid w-full max-w-[80rem] grid-cols-4 gap-x-4 gap-y-6 px-4 py-10 md:grid-cols-8 lg:grid-cols-12";
const FULL = "col-span-4 md:col-span-8 lg:col-span-12";

/**
 * The single Stoneworks category page.
 *
 * Text-led by design: every item here is produced to order, so there is no
 * product, no image and no amount to show — only the category, what it is
 * used for, and the review-only price state.
 */
export function StoneworksPage() {
  const t = useT();

  return (
    <div className="flex flex-col">
      <section className={SECTION}>
        <div className={FULL}>
          <h1 className="text-2xl font-bold text-text-primary">{t(STONEWORKS_HEADING)}</h1>
          <p className="max-w-[60ch] pt-3 text-sm text-text-secondary">{t(STONEWORKS_INTRO)}</p>
        </div>
      </section>

      <section className={SECTION} aria-labelledby="stoneworks-categories">
        <h2 id="stoneworks-categories" className={`${FULL} text-xl font-bold text-text-primary`}>
          {t(STONEWORKS_CATEGORIES_HEADING)}
        </h2>
        <div className={`${FULL} grid grid-cols-4 gap-4 md:grid-cols-8 lg:grid-cols-12`}>
          {STONEWORK_CATEGORIES.map((category) => (
            <article
              key={category.id}
              id={stoneworkAnchorId(category.id)}
              aria-labelledby={stoneworkHeadingId(category.id)}
              className="col-span-4 flex scroll-mt-24 flex-col gap-3 border border-border-subtle bg-surface p-5 md:col-span-4 lg:col-span-6"
            >
              <h3
                id={stoneworkHeadingId(category.id)}
                className="text-base font-bold text-text-primary"
              >
                {t(category.label)}
              </h3>
              <p className="text-sm text-text-secondary">{t(category.description)}</p>
              <p className="text-sm text-text-secondary">{t(category.applications)}</p>
              <p className="text-sm text-text-primary">
                <span className="text-text-caption">{t(STONEWORKS_PRICE_STATE_PREFIX)}: </span>
                <span className="font-bold">{t(STONEWORKS_PRICE_STATE_LABEL)}</span>
              </p>
              <LocaleLink
                to="/quote"
                aria-label={t(STONEWORKS_CTA_TEMPLATE, { category: t(category.label) })}
                className="inline-flex min-h-11 w-fit items-center rounded-sm border border-action-primary bg-action-primary px-5 text-sm font-bold text-text-inverse transition-colors duration-[180ms] ease-[cubic-bezier(0.2,0,0,1)] hover:bg-surface-inverse focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-inverse motion-reduce:transition-none"
              >
                {t(STONEWORKS_CTA_LABEL)}
              </LocaleLink>
            </article>
          ))}
        </div>
      </section>

      <section className={SECTION} aria-labelledby="stoneworks-process">
        <h2 id="stoneworks-process" className={`${FULL} text-xl font-bold text-text-primary`}>
          {t(STONEWORKS_PROCESS_HEADING)}
        </h2>
        <ol className={`${FULL} grid grid-cols-4 gap-4 md:grid-cols-8 lg:grid-cols-12`}>
          {STONEWORKS_PROCESS_STEPS.map((step, index) => (
            <li
              key={step}
              className="col-span-4 flex min-h-11 items-center gap-3 border border-border-subtle bg-surface px-4 py-4 md:col-span-4 lg:col-span-3"
            >
              <span aria-hidden="true" className="text-base font-bold text-decorative-accent">
                {index + 1}
              </span>
              <span className="text-sm text-text-primary">{t(step)}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
