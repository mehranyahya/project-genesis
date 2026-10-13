import type { Guide, Page, Product, SeoMeta, Site } from "./types";
import { BASE_STATIC_PATHS, DEFAULT_LOCALE, localizeRawPath, type Locale } from "../i18n/locale";
import { buildProductDetailModel } from "../product-detail";
import { buildStaticPageModel } from "../static-pages";
import { buildStoneworksPageModel } from "../service-pages";
import { isGuideSlug } from "../../../scripts/guide-policy.mjs";
import { allowsIndexing } from "../seo-indexing";

function belongsToLocale(value: { locale?: string | null }, locale: Locale): boolean {
  // Match the repository contract: only an absent label means Persian.
  return (value.locale ?? DEFAULT_LOCALE) === locale;
}

export function isIndexableSeo(
  seo: SeoMeta | null | undefined,
  basePath: string,
  locale: Locale,
): boolean {
  return (
    allowsIndexing(seo?.robots) &&
    (seo?.canonicalPath == null || seo.canonicalPath === localizeRawPath(basePath, locale))
  );
}

/** Reuse the actual detail model, so an unavailable product cannot yield a 404 URL. */
export function isIndexableProduct(product: Product, locale: Locale): boolean {
  return (
    isIndexableSeo(product.seo, "/grave-stones/" + product.slug, locale) &&
    isReadableProduct(product, locale)
  );
}
export function isReadableProduct(product: Product, locale: Locale): boolean {
  return (
    belongsToLocale(product, locale) &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(product.slug) &&
    !BASE_STATIC_PATHS.some((path) => path === `/grave-stones/${product.slug}`) &&
    buildProductDetailModel(product, product.slug) !== null
  );
}

export function isIndexableGuide(guide: Guide, locale: Locale): boolean {
  return (
    isIndexableSeo(guide.seo, "/guides/" + guide.slug, locale) && isReadableGuide(guide, locale)
  );
}
export function isReadableGuide(guide: Guide, locale: Locale): boolean {
  return (
    belongsToLocale(guide, locale) &&
    isGuideSlug(guide.slug) &&
    guide.title.trim() !== "" &&
    guide.body.trim() !== ""
  );
}

export function isIndexablePage(page: Page, locale: Locale): boolean {
  const path = page.slug === "home" ? "/" : "/" + page.slug;
  return isIndexableSeo(page.seo, path, locale) && isReadablePage(page, locale);
}
export function isReadablePage(page: Page, locale: Locale): boolean {
  // Unlike legacy products/site identity, Git pages require an explicit label.
  if (page.locale !== locale) return false;
  const model =
    page.slug === "stoneworks"
      ? buildStoneworksPageModel(page)
      : buildStaticPageModel(page, page.slug);
  return !!model?.blocks.length;
}

/** Home has approved interface copy; its brand identity must still be localized. */
export function hasLocalizedSite(site: Site, locale: Locale): boolean {
  return (
    belongsToLocale(site, locale) && site.displayName.trim() !== "" && site.latinName.trim() !== ""
  );
}
