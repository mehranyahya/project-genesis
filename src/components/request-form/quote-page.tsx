import { useNavigate } from "@tanstack/react-router";
import { RequestForm } from "@/components/request-form/request-form";
import type { Site } from "@/lib/content/types";
import type { RequestTermsDocument } from "@/lib/request-form";
import { useLocale, useT } from "@/lib/i18n/react";
import type { StoneworkCategoryId } from "@/lib/stonework-category";
import { STONEWORK_CATEGORIES } from "@/lib/stoneworks";

export const QUOTE_HEADING = "ثبت درخواست بررسی";
export const QUOTE_INTRO =
  "اطلاعات تماس را ثبت کنید تا درخواست شما بررسی شود. ثبت درخواست به معنی شروع تولید یا الزام به پرداخت نیست.";
export const QUOTE_REFERENCE_LABEL = "نمونهٔ انتخاب‌شده:";
export const QUOTE_REFERENCE_REMOVE = "حذف نمونهٔ انتخاب‌شده";
const SECONDARY =
  "inline-flex min-h-12 items-center justify-center border border-border-control bg-surface px-5 py-2 text-sm font-medium text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

export function QuotePage({
  portfolioReferenceId,
  stoneworkCategoryId = null,
  site,
  termsDocument,
}: {
  portfolioReferenceId: string | null;
  stoneworkCategoryId?: StoneworkCategoryId | null;
  site: Site | null;
  termsDocument: RequestTermsDocument | null;
}) {
  const t = useT();
  const locale = useLocale();
  const navigate = useNavigate();
  const category = STONEWORK_CATEGORIES.find((item) => item.id === stoneworkCategoryId) ?? null;
  const clearReference = () => {
    void navigate({ to: locale === "en" ? "/en/quote" : "/quote", search: {}, replace: true });
  };
  return (
    <section className="site-container section-space grid grid-cols-4 gap-x-6 gap-y-8 md:grid-cols-8 lg:grid-cols-12">
      <div className="col-span-4 md:col-span-8 lg:col-span-12">
        <h1 className="page-heading font-medium text-text-primary">{t(QUOTE_HEADING)}</h1>
        <p className="max-w-[70ch] pt-4 text-base text-text-secondary">{t(QUOTE_INTRO)}</p>
      </div>
      {portfolioReferenceId !== null || category ? (
        <div className="col-span-4 flex flex-wrap items-center justify-between gap-4 border border-border-control bg-surface p-5 md:col-span-8 lg:col-span-12">
          <p className="text-base text-text-primary">
            {category ? (
              <>
                {t("دستهٔ انتخاب‌شده:")} {t(category.label)}
              </>
            ) : (
              <>
                {t(QUOTE_REFERENCE_LABEL)} <bdi dir="ltr">{portfolioReferenceId}</bdi>
              </>
            )}
          </p>
          <button type="button" className={SECONDARY} onClick={clearReference}>
            {category ? t("حذف دستهٔ انتخاب‌شده") : t(QUOTE_REFERENCE_REMOVE)}
          </button>
        </div>
      ) : null}
      <div className="col-span-4 md:col-span-8 lg:col-span-12">
        <RequestForm
          source={{ kind: "contact", portfolioReferenceId }}
          stoneworkContext={category ? { id: category.id, label: t(category.label) } : null}
          site={site}
          termsDocument={termsDocument}
        />
      </div>
    </section>
  );
}
