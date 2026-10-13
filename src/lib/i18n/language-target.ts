import {
  basePathFromPathname,
  localizeRawPath,
  localeFromPathname,
  safeSwitchSearch,
  type Locale,
} from "./locale";
import {
  isStaticPublicPath,
  readableLocalesFromData,
  staticRouteAvailability,
  type LoaderMatch,
} from "./route-availability";

export interface LanguageTarget {
  readonly href: string;
  readonly isHomepageFallback: boolean;
}
/** Noindex describes search eligibility, not whether a reviewed translation can be read. */
export function resolveLanguageTarget(
  pathname: string,
  locale: Locale,
  search?: Record<string, unknown>,
  matches?: readonly LoaderMatch[],
): LanguageTarget {
  const base = basePathFromPathname(pathname);
  const isActive = localeFromPathname(pathname) === locale;
  const staticPath = isStaticPublicPath(base);
  const dynamicPath = /^\/(?:grave-stones|guides)\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(base);
  const structural = base === "/" || base === "/quote" || base === "/grave-stones/custom";
  const readable = staticPath
    ? staticRouteAvailability(matches, base).readableLocales
    : dynamicPath
      ? readableLocalesFromData(matches?.[matches.length - 1]?.loaderData)
      : [];
  const equivalent =
    structural || ((staticPath || dynamicPath) && (isActive || readable.includes(locale)));
  const path = localizeRawPath(equivalent ? base : "/", locale);
  const safe = equivalent ? safeSwitchSearch(search) : {};
  const query = new URLSearchParams(Object.entries(safe)).toString();
  return { href: query ? path + "?" + query : path, isHomepageFallback: !equivalent };
}
