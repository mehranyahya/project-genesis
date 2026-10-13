import { GIT_GUIDES } from "./generated-guides";
import { GIT_PAGES } from "./generated-pages";
import {
  GENERATED_PRODUCTS,
  GENERATED_PORTFOLIO_ITEMS,
  GENERATED_SITES,
} from "./generated-structured-content";
import { BASE_STATIC_PATHS, LOCALES, type BaseStaticPath } from "../i18n/locale";
import type { PublicRouteAvailability, RouteAvailability } from "../i18n/route-availability";
import { hasLocalizedSite } from "./indexability";
import { buildPublicRouteAvailability } from "./public-routes";

let compiled: PublicRouteAvailability | null = null;
/** Build artifacts are immutable for a deployed Worker; compute flags once per isolate. */
export function loadPublicRouteAvailability(): PublicRouteAvailability {
  compiled ??= buildPublicRouteAvailability({
    products: GENERATED_PRODUCTS,
    portfolioItems: GENERATED_PORTFOLIO_ITEMS,
    guides: LOCALES.flatMap((locale) => [...GIT_GUIDES[locale]]),
    pages: LOCALES.flatMap((locale) => Object.values(GIT_PAGES[locale])),
    sites: LOCALES.flatMap((locale) => {
      const site = GENERATED_SITES[locale];
      return site && hasLocalizedSite(site, locale) ? [site] : [];
    }),
  });
  const copy: Partial<Record<BaseStaticPath, RouteAvailability>> = {};
  for (const path of BASE_STATIC_PATHS) {
    const value = compiled[path];
    copy[path] = {
      readableLocales: [...value.readableLocales],
      indexableLocales: [...value.indexableLocales],
    };
  }
  return copy as PublicRouteAvailability;
}
