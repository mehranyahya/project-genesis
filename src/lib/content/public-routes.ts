import type { Guide, Page, PortfolioItem, Product, Site } from "./types";
import { BASE_STATIC_PATHS, LOCALES, type BaseStaticPath, type Locale } from "../i18n/locale";
import type { PublicRouteAvailability } from "../i18n/route-availability";
import { buildPortfolioModel } from "../portfolio";
import {
  hasLocalizedSite,
  isIndexableGuide,
  isIndexablePage,
  isIndexableProduct,
  isReadableGuide,
  isReadablePage,
  isReadableProduct,
} from "./indexability";

export interface PublicContentSnapshot {
  readonly products: readonly Product[];
  readonly guides: readonly Guide[];
  readonly pages: readonly Page[];
  readonly portfolioItems: readonly PortfolioItem[];
  readonly sites: readonly Site[];
}
function uniqueSlugs<T extends { slug: string }>(items: readonly T[]): T[] {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item.slug, (counts.get(item.slug) ?? 0) + 1);
  return items.filter((item) => counts.get(item.slug) === 1);
}
export function uniqueLocaleProducts(products: readonly Product[], locale: Locale): Product[] {
  return uniqueSlugs(
    products.filter((item) => item.isActive === true && (item.locale ?? "fa") === locale),
  );
}
export function uniqueLocaleGuides(guides: readonly Guide[], locale: Locale): Guide[] {
  return uniqueSlugs(guides.filter((item) => item.locale === locale));
}

/** Only small language flags leave this policy, never another locale's prose or media. */
export function buildPublicRouteAvailability(
  content: PublicContentSnapshot,
): PublicRouteAvailability {
  const routes: Partial<
    Record<BaseStaticPath, { readableLocales: Locale[]; indexableLocales: Locale[] }>
  > = {};
  for (const path of BASE_STATIC_PATHS)
    routes[path] = { readableLocales: [], indexableLocales: [] };
  for (const locale of LOCALES) {
    const products = uniqueLocaleProducts(content.products, locale);
    const guides = uniqueLocaleGuides(content.guides, locale);
    const sites = content.sites.filter((site) => (site.locale ?? "fa") === locale);
    for (const path of BASE_STATIC_PATHS) {
      let readable = false,
        indexable = false;
      if (path === "/") {
        // The neutral, localized home interface exists even before owner identity arrives.
        readable = true;
        indexable = sites.length === 1 && hasLocalizedSite(sites[0]!, locale);
      } else if (path === "/quote" || path === "/grave-stones/custom") {
        readable = true;
      } else if (path === "/grave-stones") {
        readable = products.some((item) => isReadableProduct(item, locale));
        indexable = products.some((item) => isIndexableProduct(item, locale));
      } else if (path === "/guides") {
        readable = guides.some((item) => isReadableGuide(item, locale));
        indexable = guides.some((item) => isIndexableGuide(item, locale));
      } else if (path === "/portfolio") {
        readable =
          buildPortfolioModel(
            content.portfolioItems.filter((item) => (item.locale ?? "fa") === locale),
          ).length > 0;
        indexable = readable;
      } else {
        const pages = content.pages.filter(
          (item) => "/" + item.slug === path && item.locale === locale,
        );
        readable = pages.length === 1 && isReadablePage(pages[0]!, locale);
        indexable = pages.length === 1 && isIndexablePage(pages[0]!, locale);
      }
      if (readable) routes[path]!.readableLocales.push(locale);
      if (indexable) routes[path]!.indexableLocales.push(locale);
    }
  }
  return routes as PublicRouteAvailability;
}
