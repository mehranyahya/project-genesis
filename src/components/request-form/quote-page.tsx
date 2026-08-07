import { useNavigate } from "@tanstack/react-router";

import { RequestForm } from "@/components/request-form/request-form";
import type { Site } from "@/lib/content/types";
import type { RequestTermsDocument } from "@/lib/request-form";

export const QUOTE_HEADING = "ثبت درخواست بررسی";
export const QUOTE_INTRO =
  "اطلاعات تماس را ثبت کنید تا درخواست شما بررسی شود. ثبت درخواست به معنی شروع تولید یا الزام به پرداخت نیست.";
export const QUOTE_REFERENCE_LABEL = "نمونهٔ انتخاب‌شده:";
export const QUOTE_REFERENCE_REMOVE = "حذف نمونهٔ انتخاب‌شده";

const SECONDARY =
  "inline-flex min-h-11 items-center justify-center border border-border-strong bg-surface px-5 py-2 text-sm font-bold text-text-primary transition-colors duration-[180ms] hover:border-action-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none";

export function QuotePage({
  portfolioReferenceId,
  site,
  termsDocument,
}: {
  portfolioReferenceId: string | null;
  site: Site | null;
  termsDocument: RequestTermsDocument | null;
}) {
  const navigate = useNavigate({ from: "/quote" });

  const clearReference = () => {
    void navigate({ to: "/quote", search: {}, replace: true });
  };

  return (
    <section className="mx-auto grid w-full max-w-[80rem] grid-cols-4 gap-x-4 gap-y-6 px-4 py-10 md:grid-cols-8 lg:grid-cols-12">
      <div className="col-span-4 md:col-span-8 lg:col-span-12">
        <h1 className="text-2xl font-bold text-text-primary">{QUOTE_HEADING}</h1>
        <p className="pt-2 text-sm text-text-secondary">{QUOTE_INTRO}</p>
      </div>

      {portfolioReferenceId !== null ? (
        <div className="col-span-4 flex flex-wrap items-center gap-3 border border-border-subtle bg-surface p-4 md:col-span-8 lg:col-span-12">
          <p className="text-sm text-text-primary">
            {QUOTE_REFERENCE_LABEL} <bdi dir="ltr">{portfolioReferenceId}</bdi>
          </p>
          <button type="button" className={SECONDARY} onClick={clearReference}>
            {QUOTE_REFERENCE_REMOVE}
          </button>
        </div>
      ) : null}

      <div className="col-span-4 md:col-span-8 lg:col-span-12">
        <RequestForm
          source={{ kind: "contact", portfolioReferenceId }}
          site={site}
          termsDocument={termsDocument}
          onSuccess={clearReference}
        />
      </div>
    </section>
  );
}
