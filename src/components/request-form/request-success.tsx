import type { ReactNode } from "react";

import { Link } from "@tanstack/react-router";

import type { Site } from "@/lib/content/types";
import { isTrackingCode } from "@/lib/request-submit";

export const SUCCESS_ACTIONS = {
  whatsapp: "ارسال کد در واتساپ",
  phone: "تماس با مهرآرا",
  portfolio: "مشاهده نمونه‌کارها",
  home: "بازگشت به خانه",
} as const;

const LINK =
  "inline-flex min-h-11 items-center justify-center border border-border-strong bg-surface px-5 py-2 text-sm font-bold text-text-primary transition-colors duration-[180ms] hover:border-action-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none";

export function successText(trackingCode: string): string {
  return `درخواست شما با کد ${trackingCode} ثبت شد. برای تسریع هماهنگی، همین کد را در واتساپ مهرآرا ارسال کنید. موجودی، محل اجرا و جزئیات سفارش بررسی می‌شود و پیش از هر اقدامی برای تأیید نهایی با شما تماس می‌گیریم. هزینهٔ حمل و نصب جداگانه و پس از بررسی محل اعلام می‌شود.`;
}

export function whatsappMessage(trackingCode: string): string {
  return `کد پیگیری مهرآرا: ${trackingCode}`;
}

function digitsOnly(value: string): string {
  return value.replace(/[^0-9+]/g, "");
}

export function whatsappHref(baseUrl: string | null, trackingCode: string): string | null {
  if (baseUrl === null || !isTrackingCode(trackingCode)) return null;
  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    return null;
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "wa.me" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.port !== "" ||
    !/^\/[1-9][0-9]{7,15}$/.test(parsed.pathname) ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    return null;
  }
  parsed.searchParams.set("text", whatsappMessage(trackingCode));
  return parsed.href;
}

export function RequestSuccess({
  trackingCode,
  site,
}: {
  trackingCode: string;
  site: Site | null;
}): ReactNode {
  if (!isTrackingCode(trackingCode)) return null;

  const whatsapp = whatsappHref(site?.whatsapp ?? null, trackingCode);
  const phone = site?.phone ?? null;

  return (
    <section
      role="status"
      aria-live="polite"
      className="flex flex-col gap-4 border border-border-subtle bg-surface p-4"
    >
      <h2 className="text-base font-bold text-text-primary">ثبت درخواست انجام شد</h2>
      <p className="text-sm text-text-primary">
        درخواست شما با کد <bdi dir="ltr">{trackingCode}</bdi> ثبت شد. برای تسریع هماهنگی، همین کد را
        در واتساپ مهرآرا ارسال کنید. موجودی، محل اجرا و جزئیات سفارش بررسی می‌شود و پیش از هر اقدامی
        برای تأیید نهایی با شما تماس می‌گیریم. هزینهٔ حمل و نصب جداگانه و پس از بررسی محل اعلام
        می‌شود.
      </p>

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
        <Link className={LINK} to="/portfolio">
          {SUCCESS_ACTIONS.portfolio}
        </Link>
        <Link className={LINK} to="/">
          {SUCCESS_ACTIONS.home}
        </Link>
      </div>
    </section>
  );
}
