/**
 * Stoneworks catalogue — pure, owner-neutral, content-free.
 *
 * These are production categories, not inventory. There is no product, no
 * media, no availability and no amount: every stonework is bespoke, so the
 * price state is always `review` and the amount is always `null`. Persian
 * strings are the translation keys (see `src/lib/i18n`).
 */
import type { PriceType } from "./content/types";

export const STONEWORK_CATEGORY_IDS = [
  "sculpture_art",
  "water_landscape",
  "architectural_elements",
  "furniture_interiors",
  "monuments_bespoke",
] as const;

export type StoneworkCategoryId = (typeof STONEWORK_CATEGORY_IDS)[number];

export interface StoneworkCategory {
  /** Stable operational id. Never translated, never derived from a brand. */
  readonly id: StoneworkCategoryId;
  /** Persian source label, also the translation key. */
  readonly label: string;
  readonly description: string;
  readonly applications: string;
  readonly priceType: PriceType;
  readonly amountToman: null;
}

export const STONEWORK_CATEGORIES: readonly StoneworkCategory[] = [
  {
    id: "sculpture_art",
    label: "مجسمه و هنر سنگی",
    description:
      "تراش دستی و ماشینی احجام هنری از سنگ طبیعی، بر پایهٔ طرح یا ایدهٔ شما و متناسب با جنس سنگ انتخابی.",
    applications: "کاربردها: فضای باز، ورودی ساختمان، محوطهٔ عمومی و مجموعه‌های فرهنگی.",
    priceType: "review",
    amountToman: null,
  },
  {
    id: "water_landscape",
    label: "آبنما و محوطه",
    description:
      "ساخت آبنما، حوض، جدول و اجزای سنگی محوطه با توجه به ابعاد زمین، مسیر آب و شرایط اجرای محل.",
    applications: "کاربردها: حیاط، باغ، محوطهٔ اداری و فضاهای شهری.",
    priceType: "review",
    amountToman: null,
  },
  {
    id: "architectural_elements",
    label: "عناصر معماری",
    description:
      "اجرای ستون، سرستون، قاب درگاه، نرده و قرنیز سنگی هماهنگ با نقشه و جزئیات معماری پروژه.",
    applications: "کاربردها: نما، ورودی، راه‌پله و بازسازی بناهای موجود.",
    priceType: "review",
    amountToman: null,
  },
  {
    id: "furniture_interiors",
    label: "دکور و مبلمان سنگی",
    description:
      "ساخت میز، نیمکت، پیشخوان، شومینه و عناصر دکوراتیو سنگی با ابعاد و پرداخت سطح موردنظر شما.",
    applications: "کاربردها: فضای داخلی مسکونی، تجاری و اداری.",
    priceType: "review",
    amountToman: null,
  },
  {
    id: "monuments_bespoke",
    label: "یادمان و سفارش اختصاصی",
    description:
      "طراحی و اجرای یادمان، لوح و سازه‌های سنگی اختصاصی که در دسته‌های دیگر نمی‌گنجند، بر اساس شرح سفارش شما.",
    applications: "کاربردها: فضاهای یادبود، پروژه‌های سازمانی و سفارش‌های خاص.",
    priceType: "review",
    amountToman: null,
  },
] as const;

/** Anchor id of a category section, derived only from its stable id. */
export function stoneworkAnchorId(id: StoneworkCategoryId): string {
  return `stonework-${id.replaceAll("_", "-")}`;
}

export function stoneworkHeadingId(id: StoneworkCategoryId): string {
  return `${stoneworkAnchorId(id)}-title`;
}

export const STONEWORKS_HEADING = "محصولات سنگی خاص";

export const STONEWORKS_INTRO =
  "همهٔ کارهای این بخش سفارشی ساخته می‌شوند. نوع سنگ، ابعاد، جزئیات تراش، شرایط محل و نصب و شیوهٔ حمل برای هر سفارش جداگانه بررسی می‌شود، بنابراین وضعیت قیمت همهٔ دسته‌ها «نیازمند بررسی» است.";

export const STONEWORKS_META_TITLE = "محصولات سنگی خاص و سفارش ساخت";

export const STONEWORKS_META_DESCRIPTION =
  "دسته‌های ساخت سفارشی سنگ: مجسمه، آبنما، عناصر معماری، دکور سنگی و یادمان. ثبت درخواست بررسی ساخت.";

export const STONEWORKS_CATEGORIES_HEADING = "دسته‌های ساخت";

export const STONEWORKS_PROCESS_HEADING = "مراحل بررسی سفارش";

export const STONEWORKS_PROCESS_STEPS = [
  "انتخاب دسته",
  "اعلام ابعاد و شرایط محل",
  "بررسی فنی",
  "تأیید نهایی",
] as const;

export const STONEWORKS_PRICE_STATE_LABEL = "نیازمند بررسی";

export const STONEWORKS_PRICE_STATE_PREFIX = "وضعیت قیمت";

export const STONEWORKS_CTA_LABEL = "درخواست ساخت";

/** Accessible name of a category CTA, so links are distinguishable. */
export const STONEWORKS_CTA_TEMPLATE = "درخواست ساخت: {category}";
