import type { ReactNode } from "react";

import { LocaleLink, useT } from "@/lib/i18n/react";
import { translatorFor, type Translator } from "@/lib/i18n/messages";

import type { Site } from "@/lib/content/types";

export const SUCCESS_ACTIONS = {
  whatsapp: "ارسال کد در واتساپ",
  phone: "تماس تلفنی",
  portfolio: "مشاهده نمونه‌کارها",
  home: "بازگشت به خانه",
} as const;

const LINK =
  "inline-flex min-h-11 items-center justify-center border border-border-strong bg-surface px-5 py-2 text-sm font-bold text-text-primary transition-colors duration-[180ms] hover:border-action-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none";

/** Persian source template. `{code}` is substituted with the tracking code. */
export const SUCCESS_TEXT_TEMPLATE =
  "درخواست شما با کد {code} ثبت شد. برای تسریع هماهنگی، همین کد را در واتساپ ارسال کنید. موجودی، محل اجرا و جزئیات سفارش بررسی می‌شود و پیش از هر اقدامی برای تأیید نهایی با شما تماس می‌گیریم. هزینهٔ حمل و نصب جداگانه و پس از بررسی محل اعلام می‌شود.";

export const WHATSAPP_MESSAGE_TEMPLATE = "کد پیگیری: {code}";

/** Persian remains the default so the existing pure-function contract holds. */
const FA: Translator = translatorFor("fa");

export function successText(trackingCode: string, t: Translator = FA): string {
  return t(SUCCESS_TEXT_TEMPLATE, { code: trackingCode });
}

export function whatsappMessage(trackingCode: string, t: Translator = FA): string {
  return t(WHATSAPP_MESSAGE_TEMPLATE, { code: trackingCode });
}

function digitsOnly(value: string): string {
  return value.replace(/[^0-9+]/g, "");
}

export function whatsappSuccessUrl(
  baseUrl: string,
  trackingCode: string,
  t: Translator = FA,
): string | null {
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== "https:" || !["wa.me", "api.whatsapp.com"].includes(url.hostname)) {
      return null;
    }
    url.searchParams.set("text", whatsappMessage(trackingCode, t));
    return url.toString();
  } catch {
    return null;
  }
}

/** Splits the localized sentence around the tracking code so it can be isolated. */
export function successTextParts(t: Translator): { before: string; after: string } {
  const template = t(SUCCESS_TEXT_TEMPLATE, { code: "\u0000" });
  const index = template.indexOf("\u0000");
  if (index < 0) return { before: template, after: "" };
  return { before: template.slice(0, index), after: template.slice(index + 1) };
}

export function RequestSuccess({
  trackingCode,
  site,
}: {
  trackingCode: string;
  site: Site | null;
}): ReactNode {
  const t = useT();
  const whatsapp = site?.whatsappUrl
    ? whatsappSuccessUrl(site.whatsappUrl, trackingCode, t)
    : null;
  const phone = site?.phone ?? null;
  const { before, after } = successTextParts(t);

  return (
    <section
      role="status"
      aria-live="polite"
      className="flex flex-col gap-4 border border-border-subtle bg-surface p-4"
    >
      <h2 className="text-base font-bold text-text-primary">{t("ثبت درخواست انجام شد")}</h2>
      <p className="text-sm text-text-primary">
        {before}
        <bdi dir="ltr">{trackingCode}</bdi>
        {after}
      </p>

      <div className="flex flex-wrap gap-3">
        {whatsapp ? (
          <a className={LINK} href={whatsapp} rel="noreferrer noopener" target="_blank">
            {t(SUCCESS_ACTIONS.whatsapp)}
          </a>
        ) : null}
        {phone ? (
          <a className={LINK} href={`tel:${digitsOnly(phone)}`}>
            {t(SUCCESS_ACTIONS.phone)}
          </a>
        ) : null}
        <LocaleLink className={LINK} to="/portfolio">
          {t(SUCCESS_ACTIONS.portfolio)}
        </LocaleLink>
        <LocaleLink className={LINK} to="/">
          {t(SUCCESS_ACTIONS.home)}
        </LocaleLink>
      </div>
    </section>
  );
}
