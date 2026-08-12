import type { MessageKey } from "./i18n/messages";

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
  /** Persian label kept for backward compatibility with existing consumers. */
  readonly label: string;
  /** Locale-aware message key — the value navigation actually renders. */
  readonly labelKey: MessageKey;
  readonly to: StaticBusinessRoute;
}

/** Primary public navigation (header + mobile panel + footer). */
export const PRIMARY_NAV: readonly NavItem[] = [
  { label: "فروشگاه سنگ مزار", labelKey: "nav.graveStones", to: "/grave-stones" },
  { label: "سفارش سفارشی", labelKey: "nav.custom", to: "/grave-stones/custom" },
  { label: "نمونه‌کارها", labelKey: "nav.portfolio", to: "/portfolio" },
  { label: "سنگ ساختمانی", labelKey: "nav.buildingStone", to: "/building-stone" },
  { label: "راهنماها", labelKey: "nav.guides", to: "/guides" },
  { label: "درباره ما", labelKey: "nav.about", to: "/about" },
  { label: "تماس", labelKey: "nav.contact", to: "/contact" },
] as const;

/** Legal destinations. Footer only — never in primary navigation. */
export const FOOTER_LEGAL_NAV: readonly NavItem[] = [
  { label: "حریم خصوصی", labelKey: "nav.privacy", to: "/privacy" },
  { label: "شرایط استفاده", labelKey: "nav.terms", to: "/terms" },
] as const;

/** The one shop CTA. Label is locked by the product contract. */
export const PRIMARY_CTA: NavItem = {
  label: "انتخاب و ثبت سفارش",
  labelKey: "cta.primary",
  to: "/grave-stones",
} as const;

export const SKIP_LINK_LABEL = "رفتن به محتوای اصلی";
export const SKIP_LINK_MESSAGE_KEY: MessageKey = "layout.skipLink";
export const MAIN_CONTENT_ID = "main-content";

export function isBusinessRoute(value: string): value is BusinessRoute {
  return (BUSINESS_ROUTES as readonly string[]).includes(value);
}
