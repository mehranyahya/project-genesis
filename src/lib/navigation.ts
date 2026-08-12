/**
 * Mehrara navigation contract.
 * The single source of truth for allowed business routes, public navigation
 * destinations and the one shop CTA. No content, no fixtures, no URLs.
 */

export const BUSINESS_ROUTES = [
  "/",
  "/grave-stones",
  "/grave-stones/$slug",
  "/grave-stones/custom",
  "/portfolio",
  "/building-stone",
  "/guides",
  "/guides/$slug",
  "/quote",
  "/about",
  "/contact",
  "/privacy",
  "/terms",
] as const;

export type BusinessRoute = (typeof BUSINESS_ROUTES)[number];

/** Routes without dynamic segments — the only ones linkable from navigation. */
export type StaticBusinessRoute = Exclude<BusinessRoute, `${string}$${string}`>;

export interface NavItem {
  /** Persian source label — also the translation key (see src/lib/i18n). */
  readonly label: string;
  readonly to: StaticBusinessRoute;
}

/** Primary public navigation (header + mobile panel + footer). */
export const PRIMARY_NAV: readonly NavItem[] = [
  { label: "فروشگاه سنگ مزار", to: "/grave-stones" },
  { label: "سفارش سفارشی", to: "/grave-stones/custom" },
  { label: "نمونه‌کارها", to: "/portfolio" },
  { label: "سنگ ساختمانی", to: "/building-stone" },
  { label: "راهنماها", to: "/guides" },
  { label: "درباره ما", to: "/about" },
  { label: "تماس", to: "/contact" },
] as const;

/** Legal destinations. Footer only — never in primary navigation. */
export const FOOTER_LEGAL_NAV: readonly NavItem[] = [
  { label: "حریم خصوصی", to: "/privacy" },
  { label: "شرایط استفاده", to: "/terms" },
] as const;

/** The one shop CTA. Label is locked by the product contract. */
export const PRIMARY_CTA: NavItem = {
  label: "انتخاب و ثبت سفارش",
  to: "/grave-stones",
} as const;

export const SKIP_LINK_LABEL = "رفتن به محتوای اصلی";
export const MAIN_CONTENT_ID = "main-content";

export function isBusinessRoute(value: string): value is BusinessRoute {
  return (BUSINESS_ROUTES as readonly string[]).includes(value);
}
