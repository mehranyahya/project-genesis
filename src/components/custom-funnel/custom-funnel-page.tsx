import { useEffect, useMemo, useState } from "react";

import { CustomFunnelEmpty } from "./custom-funnel-states";
import { CustomFunnelStepper } from "./custom-funnel-stepper";
import type { Product } from "@/lib/content/types";
import { CUSTOM_FUNNEL_OPTION_ROLES, buildCustomFunnelModel } from "@/lib/custom-funnel";
import type { GraveStoneRequestDraft } from "@/lib/request-draft";

export const CUSTOM_FUNNEL_HEADING = "ساخت مرحله‌ای سنگ مزار";
export const CUSTOM_FUNNEL_INTRO =
  "انتخاب‌ها در این مرحله فقط برای آماده‌سازی خلاصه سفارش است و هنوز ثبت یا ارسال نمی‌شود.";
export const CUSTOM_FUNNEL_RELOAD_TEXT =
  "انتخاب‌های قبلی ذخیره نشده‌اند و مسیر از مرحلهٔ اول آغاز شد.";
export const CUSTOM_FUNNEL_DRAFT_READY_TEXT =
  "خلاصه انتخاب آماده است؛ ثبت سفارش در این مرحله انجام نشده است.";

export function CustomFunnelPage({
  products,
  catalogVersion,
}: {
  products: readonly Product[];
  catalogVersion: string | null;
}) {
  // Draft stays in React memory only: no storage, no URL, no network.
  const [draft, setDraft] = useState<GraveStoneRequestDraft | null>(null);
  const [reloaded, setReloaded] = useState(false);

  const model = useMemo(
    () => buildCustomFunnelModel({ products, roles: CUSTOM_FUNNEL_OPTION_ROLES }),
    [products],
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof performance === "undefined") return;
    const entry = performance.getEntriesByType("navigation")[0] as
      | { type?: string }
      | undefined;
    if (entry?.type === "reload") setReloaded(true);
  }, []);

  return (
    <section className="mx-auto grid w-full max-w-[80rem] grid-cols-4 gap-x-4 gap-y-6 px-4 py-10 md:grid-cols-8 lg:grid-cols-12">
      <div className="col-span-4 md:col-span-8 lg:col-span-12">
        <h1 className="text-2xl font-bold text-text-primary">{CUSTOM_FUNNEL_HEADING}</h1>
        <p className="pt-2 text-sm text-text-secondary">{CUSTOM_FUNNEL_INTRO}</p>
        <p aria-live="polite" className="pt-2 text-sm text-text-caption">
          {reloaded ? CUSTOM_FUNNEL_RELOAD_TEXT : null}
        </p>
      </div>

      {model.stones.length === 0 ? (
        <CustomFunnelEmpty />
      ) : (
        <CustomFunnelStepper
          model={model}
          catalogVersion={catalogVersion}
          onDraftReady={(next) => setDraft(next)}
        />
      )}

      <p
        role="status"
        aria-live="polite"
        className="col-span-4 text-sm text-text-secondary md:col-span-8 lg:col-span-12"
      >
        {draft ? CUSTOM_FUNNEL_DRAFT_READY_TEXT : null}
      </p>
    </section>
  );
}
