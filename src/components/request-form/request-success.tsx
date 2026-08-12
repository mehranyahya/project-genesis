import type { ReactNode } from "react";

import { LocaleLink, useT } from "@/lib/i18n/react";

import type { Site } from "@/lib/content/types";

export const SUCCESS_ACTIONS = {
  whatsapp: "ارسال کد در واتساپ",
  phone: "تماس تلفنی",
  portfolio: "مشاهده نمونه‌کارها",
  home: "بازگشت به خانه",
} as const;

const LINK =
  "inline-flex min-h-11 items-center justify-center border border-border-strong bg-surface px-5 py-2 text-sm font-bold text-text-primary transition-colors duration-[180ms] hover:border-action-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none";

export function successText(trackingCode: string): string {
  return `درخواست شما با کد ${trackingCode} ثبت شد. برای تسریع هماهنگی، همین کد را در واتساپ ارسال کنید. موجودی، محل اجرا و جزئیات سفارش بررسی می‌شود و پیش از هر اقدامی برای تأیید نهایی با شما تماس می‌گیریم. هزینهٔ حمل و نصب جداگانه و پس از بررسی محل اعلام می‌شود.`;
}

export function whatsappMessage(trackingCode: string): string {
  return `کد پیگیری: ${trackingCode}`;
}

function digitsOnly(value: string): string {
  return value.replace(/[^0-9+]/g, "");
}

export function whatsappSuccessUrl(baseUrl: string, trackingCode: string): string | null {
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== "https:" || !["wa.me", "api.whatsapp.com"].includes(url.hostname)) {
      return null;
    }
    url.searchParams.set("text", whatsappMessage(trackingCode));
    return url.toString();
  } catch {
    return null;
  }
}

export function RequestSuccess({
  trackingCode,
  site,
}: {
  trackingCode: string;
  site: Site | null;
}): ReactNode {
  const t = useT();
  const whatsapp = site?.whatsappUrl ? whatsappSuccessUrl(site.whatsappUrl, trackingCode) : null;
  const phone = site?.phone ?? null;

  return (
    <section
      role="status"
      aria-live="polite"
      className="flex flex-col gap-4 border border-border-subtle bg-surface p-4"
    >
      <h2 className="text-base font-bold text-text-primary">{t("ثبت درخواست انجام شد")}</h2>
      <p className="text-sm text-text-primary">{t("درخواست شما با کد")}<bdi dir="ltr">{trackingCode}</bdi>{t("ثبت شد. برای تسریع هماهنگی، همین کد را در واتساپ ارسال کنید. موجودی، محل اجرا و جزئیات سفارش بررسی می‌شود و پیش از هر اقدامی برای تأیید نهایی با شما تماس می‌گیریم. هزینهٔ حمل و نصب جداگانه و پس از بررسی محل اعلام می‌شود.")}</p>

      <div className="flex flex-wrap gap-3">
        {whatsapp ? (
          <a className={LINK} href={whatsapp} rel="noreferrer noopener" target="_blank">
            {SUCCESS_ACTIONS.whatsapp}
          </a>
        ) : null}
        {phone ? (
          <a className={LINK} href={`tel:${digitsOnly(phone)}`}>
            {SUCCESS_ACTIONS.phone}
          </a>
        ) : null}
        <LocaleLink className={LINK} to="/portfolio">
          {SUCCESS_ACTIONS.portfolio}
        </LocaleLink>
        <LocaleLink className={LINK} to="/">
          {SUCCESS_ACTIONS.home}
        </LocaleLink>
      </div>
    </section>
  );
}
