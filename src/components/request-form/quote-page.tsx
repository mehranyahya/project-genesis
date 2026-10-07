import { useNavigate } from "@tanstack/react-router";

import { RequestForm } from "@/components/request-form/request-form";
import type { Site } from "@/lib/content/types";
import type { RequestTermsDocument } from "@/lib/request-form";
import { useStaticPath, useT } from "@/lib/i18n/react";
import { useStoneworkRequest } from "@/lib/stonework-request-context";
import { STONEWORK_CATEGORIES } from "@/lib/stoneworks";

export const QUOTE_HEADING = "ثبت درخواست بررسی";
export const QUOTE_INTRO =
  "اطلاعات تماس را ثبت کنید تا درخواست شما بررسی شود. ثبت درخواست به معنی شروع تولید یا الزام به پرداخت نیست.";
export const QUOTE_REFERENCE_LABEL = "نمونهٔ انتخاب‌شده:";
export const QUOTE_REFERENCE_REMOVE = "حذف نمونهٔ انتخاب‌شده";

const SECONDARY =
  "inline-flex min-h-12 items-center justify-center border border-border-strong bg-surface px-5 py-2 text-sm font-bold text-text-primary transition-colors duration-[180ms] hover:border-action-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none";

export function QuotePage({
  portfolioReferenceId,
  site,
  termsDocument,
}: {
  portfolioReferenceId: string | null;
  site: Site | null;
  termsDocument: RequestTermsDocument | null;
}) {
  const t = useT();
  const { category, selectCategory } = useStoneworkRequest();
  const selectedCategory = STONEWORK_CATEGORIES.find((item) => item.id === category);
  const notePrefix = selectedCategory
    ? t("ساخت سفارشی: {category}", { category: t(selectedCategory.label) })
    : "";
  const navigate = useNavigate();
  const quotePath = useStaticPath("/quote");

  const clearReference = () => {
    void navigate({ to: quotePath, search: {}, replace: true });
  };

  return (
    <section className="mx-auto grid w-full max-w-[80rem] grid-cols-4 gap-x-4 gap-y-6 px-5 py-12 md:grid-cols-8 md:px-6 md:py-20 lg:grid-cols-12">
      <div className="col-span-4 md:col-span-8 lg:col-span-12">
        <h1 className="page-title font-medium text-text-primary">{t(QUOTE_HEADING)}</h1>
        <p className="pt-2 text-sm text-text-secondary">{t(QUOTE_INTRO)}</p>
      </div>

      {selectedCategory ? (
        <div className="col-span-4 flex flex-wrap items-center gap-3 border border-border-subtle bg-surface p-4 md:col-span-8 lg:col-span-12">
          <p className="text-base text-text-primary">{notePrefix}</p>
          <button type="button" className={SECONDARY} onClick={() => selectCategory(null)}>
            {t("حذف دستهٔ انتخاب‌شده")}
          </button>
        </div>
      ) : null}

      {portfolioReferenceId !== null ? (
        <div className="col-span-4 flex flex-wrap items-center gap-3 border border-border-subtle bg-surface p-4 md:col-span-8 lg:col-span-12">
          <p className="text-sm text-text-primary">
            {t(QUOTE_REFERENCE_LABEL)} <bdi dir="ltr">{portfolioReferenceId}</bdi>
          </p>
          <button type="button" className={SECONDARY} onClick={clearReference}>
            {t(QUOTE_REFERENCE_REMOVE)}
          </button>
        </div>
      ) : null}

      <div className="col-span-4 md:col-span-8 lg:col-span-12">
        <RequestForm
          source={{ kind: "contact", portfolioReferenceId }}
          site={site}
          termsDocument={termsDocument}
          notePrefix={notePrefix}
        />
      </div>
    </section>
  );
}
