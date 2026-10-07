/**
 * Site navigation contract.
 * The single source of truth for allowed business routes, public navigation
 * destinations and the general enquiry CTA. No content, no fixtures, no URLs.
 */

export const BUSINESS_ROUTES = [
  "/",
  "/grave-stones",
  "/grave-stones/$slug",
  "/grave-stones/custom",
  "/portfolio",
  "/building-stone",
  "/stoneworks",
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

/** Equal service routes, used by home, header and footer. */
export const SERVICE_NAV: readonly NavItem[] = [
  { label: "سنگ مزار", to: "/grave-stones" },
  { label: "سنگ ساختمانی", to: "/building-stone" },
  { label: "ساخت سفارشی", to: "/stoneworks" },
] as const;

/** Primary public navigation. */
export const PRIMARY_NAV: readonly NavItem[] = [
  ...SERVICE_NAV,
  { label: "نمونه‌کارها", to: "/portfolio" },
] as const;

export const SECONDARY_NAV: readonly NavItem[] = [
  { label: "راهنماها", to: "/guides" },
  { label: "درباره ما", to: "/about" },
  { label: "تماس", to: "/contact" },
] as const;

/** Legal destinations. Footer only — never in primary navigation. */
export const FOOTER_LEGAL_NAV: readonly NavItem[] = [
  { label: "حریم خصوصی", to: "/privacy" },
  { label: "شرایط استفاده", to: "/terms" },
] as const;

/** Shared enquiry entry for all services. */
export const PRIMARY_CTA: NavItem = {
  label: "شروع گفت‌وگو",
  to: "/quote",
} as const;

export const SKIP_LINK_LABEL = "رفتن به محتوای اصلی";
export const MAIN_CONTENT_ID = "main-content";

export function isBusinessRoute(value: string): value is BusinessRoute {
  return (BUSINESS_ROUTES as readonly string[]).includes(value);
}
