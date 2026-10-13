import { useLocale, useT } from "@/lib/i18n/react";
import { localizeRawPath } from "@/lib/i18n/locale";
import { GuideBody } from "@/components/guides/guides";
import type { StoneworksPageModel } from "@/lib/service-pages";
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
  stoneworkAnchorId,
  stoneworkHeadingId,
} from "@/lib/stoneworks";

const SECTION =
  "site-container section-space grid grid-cols-4 gap-x-6 gap-y-8 md:grid-cols-8 lg:grid-cols-12";
const FULL = "col-span-4 md:col-span-8 lg:col-span-12";

/**
 * The single Stoneworks category page.
 *
 * Only categories explicitly selected in a reviewed service page are offered.
 * There is no inventory, fixed amount or fabricated editorial media.
 */
export function StoneworksPage({ page = null }: { page?: StoneworksPageModel | null }) {
  const t = useT();
  const locale = useLocale();
  const categories = page?.categories ?? [];

  return (
    <div className="flex flex-col">
      <section className={SECTION}>
        <div className={FULL}>
          <h1 className="page-heading font-medium text-text-primary">
            {page?.title ?? t(STONEWORKS_HEADING)}
          </h1>
          {page ? (
            <div className="max-w-[70ch] pt-4">
              <GuideBody blocks={page.blocks} />
            </div>
          ) : null}
          <p className="max-w-[70ch] pt-4 text-base text-text-secondary">{t(STONEWORKS_INTRO)}</p>
          {categories.length === 0 ? (
            <a href={localizeRawPath("/quote", locale)} className="ui-action mt-6">
              {t("ثبت درخواست بررسی")}
            </a>
          ) : null}
        </div>
      </section>

      {categories.length > 0 ? (
        <section className={SECTION} aria-labelledby="stoneworks-categories">
          <h2 id="stoneworks-categories" className={`${FULL} section-heading text-text-primary`}>
            {t(STONEWORKS_CATEGORIES_HEADING)}
          </h2>
          <div className={`${FULL} grid grid-cols-4 gap-6 md:grid-cols-8 lg:grid-cols-12`}>
            {categories.map((category) => (
              <article
                key={category.id}
                id={stoneworkAnchorId(category.id)}
                aria-labelledby={stoneworkHeadingId(category.id)}
                className="col-span-4 flex flex-col gap-4 border border-border-subtle bg-surface p-6 md:col-span-4 lg:col-span-6"
              >
                <h3
                  id={stoneworkHeadingId(category.id)}
                  className="text-2xl font-medium text-text-primary"
                >
                  {t(category.label)}
                </h3>
                <p className="text-sm text-text-secondary">{t(category.description)}</p>
                <p className="text-sm text-text-secondary">{t(category.applications)}</p>
                <p className="text-sm text-text-primary">
                  <span className="text-text-caption">{t(STONEWORKS_PRICE_STATE_PREFIX)}: </span>
                  <span className="font-bold">{t(STONEWORKS_PRICE_STATE_LABEL)}</span>
                </p>
                <a
                  href={
                    localizeRawPath("/quote", locale) + "?source=stoneworks&category=" + category.id
                  }
                  aria-label={t(STONEWORKS_CTA_TEMPLATE, { category: t(category.label) })}
                  className="ui-action mt-auto min-h-12 w-fit focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  {t(STONEWORKS_CTA_LABEL)}
                </a>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className={SECTION} aria-labelledby="stoneworks-process">
        <h2 id="stoneworks-process" className={`${FULL} section-heading text-text-primary`}>
          {t(STONEWORKS_PROCESS_HEADING)}
        </h2>
        <ol className={`${FULL} grid grid-cols-4 gap-4 md:grid-cols-8 lg:grid-cols-12`}>
          {STONEWORKS_PROCESS_STEPS.map((step, index) => (
            <li
              key={step}
              className="col-span-4 flex min-h-12 items-center gap-3 border border-border-subtle bg-surface px-4 py-4 md:col-span-4 lg:col-span-3"
            >
              <span aria-hidden="true" className="text-base font-bold text-text-secondary">
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
